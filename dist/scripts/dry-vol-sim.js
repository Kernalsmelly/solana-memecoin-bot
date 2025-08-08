import 'dotenv/config';
/**
 * Forced Trade Pilot Script
 *
 * Usage:
 *   npx tsx scripts/dry-vol-sim.ts --force-trade --token=<MINT> --size=<SOL>
 *
 * Environment Variables:
 *   SOLANA_PRIVATE_KEY  - Wallet private key (comma-separated Uint8Array)
 *   BASE_MINT           - Input mint (default: SOL)
 *   SLIPPAGE_BPS        - Slippage in bps (default: 50)
 *   FORCED_SEED_TOKENS  - Comma-separated list of tokens to use (no 'dummy')
 *
 * This script will:
 *   - Validate forced trade token and size
 *   - Fetch a Jupiter quote and swap transaction
 *   - Sign and submit a real trade to Solana mainnet
 *   - Print debug logs for every step
 *   - Refuse to run with dummy tokens or insufficient params
 */
// --- HARD GUARD: Refuse to run if FORCED_SEED_TOKENS is 'dummy' ---
if (process.env.FORCED_SEED_TOKENS && process.env.FORCED_SEED_TOKENS.includes('dummy')) {
    console.error('[FATAL] FORCED_SEED_TOKENS is set to or includes "dummy":', process.env.FORCED_SEED_TOKENS);
    process.exit(1);
}
import { TokenDiscovery } from '../src/discovery/tokenDiscovery.js';
import { VolatilitySqueeze } from '../src/strategies/volatilitySqueeze.js';
import { ParameterSweepManager } from '../src/strategy/ParameterSweepManager.js';
import { StrategyCoordinator } from '../src/strategy/StrategyCoordinator.js';
import logger from '../src/utils/logger.js';
import { RiskManager } from '../src/live/riskManager.js';
import { NotificationManager } from '../src/live/notificationManager.js';
import minimist from 'minimist';
import { handleDryRunFill } from '../src/orderExecution/dryRunFill.js';
import ConnectionManager from '../src/connectionManager.js';
import { EnvVarSigner } from '../src/orderExecution/signer.js';
import { OrderManager } from '../src/orderExecution/orderManager.js';
import { fetchJupiterQuote } from '../src/orderExecution/jupiterQuote.js';
// --- DEBUG LOGGING SPRINT PATCH ---
function debug(...args) {
    console.log('[DEBUG]', ...args);
}
/**
 * Entry point for forced trade pilot.
 * Parses CLI args, validates forced token, fetches quote and swap tx, submits real trade.
 */
async function main() {
    try {
        // Parse CLI flags
        const argv = minimist(process.argv.slice(2));
        const maxTrades = argv['max-trades'] ? Number(argv['max-trades']) : Infinity;
        const minutes = argv['minutes'] ? Number(argv['minutes']) : 30;
        const liveMode = true;
        console.warn('[WARNING] LIVE MODE ENABLED: This run will submit a REAL transaction to Solana mainnet!');
        const forceTrade = argv['force-trade'] || false;
        const forceToken = argv['token'] ||
            (process.env.FORCED_SEED_TOKENS ? process.env.FORCED_SEED_TOKENS.split(',')[0] : null);
        // Patch: Use 0.03 SOL for forced trades unless overridden by --size
        const forceSize = argv['size'] ? Number(argv['size']) : forceTrade ? 0.03 : 0.01;
        let forceSizeBaseUnits = forceSize;
        if (forceTrade && forceToken) {
            // Fetch decimals for the input token
            const { Connection, PublicKey } = await import('@solana/web3.js');
            const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
            const mintPubkey = new PublicKey(forceToken);
            let decimals = 9; // Default to 9 (SOL)
            try {
                const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
                function isParsedAccountData(data) {
                    return (data &&
                        typeof data === 'object' &&
                        'parsed' in data &&
                        data.parsed &&
                        typeof data.parsed === 'object' &&
                        'info' in data.parsed &&
                        data.parsed.info &&
                        typeof data.parsed.info.decimals === 'number');
                }
                // ...
                if (mintInfo.value &&
                    'data' in mintInfo.value &&
                    mintInfo.value.data &&
                    isParsedAccountData(mintInfo.value.data)) {
                    decimals = mintInfo.value.data.parsed.info.decimals;
                }
            }
            catch (e) {
                debug('Failed to fetch decimals for token', forceToken, e);
            }
            forceSizeBaseUnits = Math.floor(forceSize * Math.pow(10, decimals));
            debug(`[FORCED SIZE CONVERSION] Human: ${forceSize} | Decimals: ${decimals} | Base Units: ${forceSizeBaseUnits}`);
        }
        debug('CLI options:', argv);
        debug('FORCED_SEED_TOKENS:', process.env.FORCED_SEED_TOKENS);
        debug('PRICE_CHANGE_THRESHOLD=', process.env.PRICE_CHANGE_THRESHOLD, 'VOLUME_MULTIPLIER=', process.env.VOLUME_MULTIPLIER);
        // Notification manager for alerts (dummy config for now)
        const notificationManager = new NotificationManager({ notifyLevel: 'all' });
        // Initialize components with dry-run settings
        const discovery = new TokenDiscovery({
            minLiquidity: 50000, // $50k minimum
            maxTokenAge: 24 * 60 * 60 * 1000, // 24 hours
            cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
        });
        if (forceTrade) {
            console.log('[DEBUG] FORCED_SEED_TOKENS env:', process.env.FORCED_SEED_TOKENS);
            console.log('[DEBUG] CLI argv:', argv);
            console.log('[DEBUG] Initial forceToken:', forceToken);
            // Validate forced token
            let usableToken = forceToken;
            const knownMainnetMints = [
                'So11111111111111111111111111111111111111112', // SOL
                'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                '4k3Dyjzvzp8eMZWUXb6oJpMmf9ZUr6DLi5QgLkGzjA2M', // RAY
                'DezX6SeBjcJzJ5i5r9dQ6hQ6hQ6hQ6hQ6hQ6hQ6hQ6hQ', // BONK (example)
            ];
            if (!usableToken || usableToken === 'dummy' || usableToken.length < 32) {
                usableToken = knownMainnetMints[2]; // Fallback to USDC
                console.log('[DEBUG] Fallback to USDC for forced trade:', usableToken);
            }
            if (usableToken === 'dummy' || usableToken.length < 32) {
                console.error('[ERROR] Refusing to trade with invalid/dummy mint:', usableToken);
                process.exit(1);
            }
            debug('--- FORCE TRADE MODE ---');
            debug('Using forced token:', usableToken);
            if (!usableToken || usableToken === 'dummy') {
                usableToken = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'; // USDC
                debug('Fallback to USDC for forced trade:', usableToken);
            }
            debug('About to submit forced order:', {
                tokenMint: usableToken,
                action: 'buy',
                size: forceSize,
            });
            let connection, signer, orderManager;
            let quote, rawQuote;
            try {
                debug('Connecting to Solana...');
                connection = await ConnectionManager.getInstance().getConnection();
                debug('Connected.');
            }
            catch (e) {
                debug('ERROR: Failed to connect to Solana:', e);
                process.exit(1);
            }
            try {
                debug('Instantiating signer...');
                signer = new EnvVarSigner();
                debug('Signer ready.');
            }
            catch (e) {
                debug('ERROR: Failed to instantiate signer:', e);
                process.exit(1);
            }
            try {
                debug('Instantiating order manager...');
                orderManager = new OrderManager(connection, signer);
                debug('OrderManager ready.');
            }
            catch (e) {
                debug('ERROR: Failed to instantiate OrderManager:', e);
                process.exit(1);
            }
            // Fix: inputMint is always the token you want to sell (forced token), outputMint is what you want to buy (default SOL)
            const inputMint = usableToken;
            const outputMint = process.env.BASE_OUTPUT_MINT || 'So11111111111111111111111111111111111111112';
            debug(`[FORCED TRADE] inputMint (sell): ${inputMint}, outputMint (buy): ${outputMint}`);
            if (outputMint === 'dummy' || !outputMint || outputMint.length < 32) {
                console.error('[ERROR] Refusing to trade with invalid/dummy mint at quote fetch:', outputMint);
                process.exit(1);
            }
            console.log('[DEBUG] About to fetch Jupiter quote with outputMint:', outputMint);
            const amount = Math.floor(forceSize * 1e9); // assuming 9 decimals for SOL
            const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
            try {
                debug('Fetching Jupiter quote for forced trade...');
                debug(`[FORCED TRADE] Using amount (base units):`, forceSizeBaseUnits);
                const quoteResult = await fetchJupiterQuote({
                    inputMint,
                    outputMint,
                    amount: forceSizeBaseUnits,
                    slippageBps,
                });
                quote = quoteResult.parsed;
                rawQuote = quoteResult.raw;
                debug('Quote result:', quote);
                debug('Raw quote:', rawQuote);
            }
            catch (e) {
                debug('ERROR: Failed to fetch Jupiter quote:', e);
                process.exit(1);
            }
            if (!rawQuote || !rawQuote.outAmount) {
                debug('No quote available for forced trade token:', usableToken);
                process.exit(1);
            }
            try {
                if (liveMode) {
                    debug('LIVE MODE: Fetching Jupiter swap transaction...');
                    const { fetchJupiterSwapTx } = await import('../src/orderExecution/jupiterSwap.js');
                    const userPublicKey = signer.publicKey?.toBase58
                        ? signer.publicKey.toBase58()
                        : signer.publicKey.toString();
                    debug('Signer publicKey:', signer.publicKey.toBase58());
                    debug('userPublicKey sent to Jupiter:', userPublicKey);
                    debug(`[FORCED TRADE] Submitting swap with amount (base units):`, forceSizeBaseUnits);
                    const swapTxBase64 = await fetchJupiterSwapTx({
                        inputMint,
                        outputMint,
                        amount: parseFloat(forceSizeBaseUnits.toString() ?? '0'),
                        slippageBps,
                        userPublicKey,
                        quoteResponse: rawQuote, // Pass the raw quote object as required by Jupiter v6
                    });
                    if (!swapTxBase64) {
                        debug('ERROR: Jupiter did not return a swap transaction.');
                        process.exit(1);
                    }
                    debug('Swap transaction (base64):', swapTxBase64);
                    debug('Deserializing transaction...');
                    const { VersionedTransaction } = await import('@solana/web3.js');
                    const swapTxBuf = Buffer.from(String(swapTxBase64), 'base64');
                    const transaction = VersionedTransaction.deserialize(swapTxBuf);
                    debug('Signing and sending transaction...');
                    try {
                        const signature = await signer.signAndSendTransaction(transaction, connection);
                        debug('[OrderSubmitted] Signature:', signature);
                        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
                        debug('[OrderConfirmedEvent] Signature:', signature, confirmation);
                        console.log('[SUCCESS] Trade submitted and confirmed! Signature:', signature);
                        process.exit(0);
                    }
                    catch (e) {
                        debug('ERROR: Failed during transaction submission:', e);
                        if (e.logs) {
                            console.error('[SOLANA LOGS]', e.logs);
                        }
                        if (typeof e.getLogs === 'function') {
                            try {
                                const logs = await e.getLogs();
                                console.error('[SOLANA SIMULATION LOGS]', logs);
                            }
                            catch (logErr) {
                                console.error('[ERROR] Could not fetch simulation logs:', logErr);
                            }
                        }
                        process.exit(1);
                    }
                }
                else {
                    debug('Simulating transaction...');
                    debug('Transaction sent: <SIMULATED>', { quote });
                    debug('[OrderSubmitted] Forced trade for', usableToken);
                    debug('[OrderConfirmedEvent] Forced trade for', usableToken);
                    debug('[PnL Summary] { totalPnl: <sim>, totalFees: <sim>, avgSlippageBps: <sim> }');
                    process.exit(0);
                }
            }
            catch (e) {
                debug('ERROR: Failed during transaction submission:', e);
                process.exit(1);
            }
        }
        // Parameter sweep grid (customize as needed)
        const paramGrid = [
            { priceChangeThreshold: 15, volumeMultiplier: 1.5 },
            { priceChangeThreshold: 20, volumeMultiplier: 2 },
            { priceChangeThreshold: 25, volumeMultiplier: 2.5 },
        ];
        const sweepManager = new ParameterSweepManager(paramGrid, 5); // 5 trades per batch
        sweepManager.on('ParameterUpdateEvent', (params) => {
            logger.info(`[ParameterUpdateEvent] New params: ${JSON.stringify(params)}`);
            // Update VolatilitySqueeze params on the fly
            volatilitySqueeze.setParams(params);
        });
        const initialParams = sweepManager.getCurrentParams();
        const volatilitySqueeze = new VolatilitySqueeze({
            ...initialParams,
            lookbackPeriodMs: 30 * 60 * 1000,
            checkIntervalMs: 60 * 1000,
        });
        // Multi-token concurrency: setup strategy coordinator
        const coordinator = new StrategyCoordinator({
            strategies: [],
            maxConcurrent: 3,
            cooldownMs: 2 * 60 * 1000,
        }); // 3 tokens, 2min cooldown
        discovery.on('tokenDiscovered', async (token) => {
            logger.info(`New token discovered: ${token.address}`);
            coordinator.enqueueToken(token.address);
        });
        volatilitySqueeze.on('patternMatch', async (match) => {
            coordinator.enqueueToken(match.token.address);
        });
        coordinator.on('tokenDispatch', async (tokenAddress) => {
            logger.info(`[Coordinator] Dispatching execution for token ${tokenAddress}`);
            // Insert execution logic here (swap, order, etc.)
            // For demo, just simulate a fill and call completeToken
            try {
                // Fetch Jupiter quote for token/SOL
                const inputMint = process.env.BASE_MINT || 'So11111111111111111111111111111111111111112';
                const outputMint = tokenAddress;
                if (inputMint === outputMint) {
                    logger.warn(`[SwapLogic] Skipping swap: inputMint and outputMint are the same (${inputMint})`);
                    coordinator.completeToken(tokenAddress);
                    return;
                }
                const amount = Number(process.env.SIM_AMOUNT) || 1000000;
                const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
                const { fetchJupiterQuote } = await import('../src/orderExecution/jupiterQuote.js');
                const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
                if (!quote) {
                    logger.warn('[JupiterQuote] No quote available for token', tokenAddress);
                    coordinator.completeToken(tokenAddress);
                    return;
                }
                logger.info('[JupiterQuote]', JSON.stringify(quote));
                // Simulate fill
                const fill = {
                    action: 'buy',
                    tokenAddress,
                    quantity: amount / 1e9,
                    price: quote &&
                        typeof quote === 'object' &&
                        'parsed' in quote &&
                        quote.parsed &&
                        typeof quote.parsed === 'object' &&
                        'price' in quote.parsed &&
                        typeof quote.parsed.price === 'number'
                        ? quote.parsed.price
                        : 0,
                    meta: { quote },
                };
                const { handleDryRunFill } = await import('../src/orderExecution/dryRunFill.js');
                if (typeof handleDryRunFill === 'function')
                    await handleDryRunFill(fill, riskManager);
                fills.push(fill);
                fillCount++;
                coordinator.completeToken(tokenAddress);
            }
            catch (e) {
                logger.error(`[Coordinator] Execution error for ${tokenAddress}:`, e);
                coordinator.completeToken(tokenAddress);
            }
        });
        const fills = [];
        // Inject a real RiskManager for dry-run tracking
        const riskManager = new RiskManager({
            maxDrawdown: 0.2,
            maxDailyLoss: 0.1,
            maxPositions: 5,
            maxPositionSize: 10,
        });
        let fillCount = 0;
        let killSwitchEngaged = false;
        // Live-mode: set up connection, signer, and order manager
        let connection;
        let signer;
        let orderManager;
        if (liveMode) {
            connection = await ConnectionManager.getInstance().getConnection();
            signer = new EnvVarSigner();
            orderManager = new OrderManager(connection, signer);
            orderManager.on('orderFilled', (order) => {
                logger.info(`[OrderConfirmedEvent] Signature: ${order.signature} Status: ${order.status}`);
                fills.push({
                    ...order,
                    confirmed: true,
                });
                fillCount++;
                // Risk manager update
                riskManager.recordTrade(0); // Replace 0 with actual PnL if available
                sweepManager.recordTrade(order.pnl ?? 0); // Track PnL for parameter sweep
                // --- Automated parameter sweep feedback (live mode) ---
                if (liveMode &&
                    sweepManager.getHistory().length > 0 &&
                    sweepManager.getHistory().length % 2 === 0) {
                    // every 2 batches for demo
                    // Run a local sweep around the current params
                    const lastBest = sweepManager.getCurrentParams();
                    const sweepGrid = [
                        {
                            priceChangeThreshold: lastBest.priceChangeThreshold - 2,
                            volumeMultiplier: lastBest.volumeMultiplier,
                        },
                        {
                            priceChangeThreshold: lastBest.priceChangeThreshold,
                            volumeMultiplier: lastBest.volumeMultiplier,
                        },
                        {
                            priceChangeThreshold: lastBest.priceChangeThreshold + 2,
                            volumeMultiplier: lastBest.volumeMultiplier,
                        },
                        {
                            priceChangeThreshold: lastBest.priceChangeThreshold,
                            volumeMultiplier: lastBest.volumeMultiplier - 0.2,
                        },
                        {
                            priceChangeThreshold: lastBest.priceChangeThreshold,
                            volumeMultiplier: lastBest.volumeMultiplier + 0.2,
                        },
                    ];
                    let bestSharpe = -Infinity, bestParams = lastBest;
                    for (const params of sweepGrid) {
                        // Simulate performance (replace with real backtest if available)
                        const mockPnls = sweepManager
                            .getHistory()
                            .slice(-2)
                            .map((b) => b.totalPnL + Math.random() - 0.5); // mock
                        const mean = mockPnls.reduce((a, b) => a + b, 0) / mockPnls.length;
                        const std = Math.sqrt(mockPnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (mockPnls.length || 1));
                        const sharpe = std ? mean / std : mean;
                        if (sharpe > bestSharpe) {
                            bestSharpe = sharpe;
                            bestParams = params;
                        }
                    }
                    logger.info(`[ParamSweep] Feedback sweep complete. Best params: ${JSON.stringify(bestParams)} (Sharpe-like: ${bestSharpe.toFixed(2)})`);
                    volatilitySqueeze.setParams(bestParams);
                    sweepManager.emit('ParameterUpdateEvent', bestParams);
                }
                if (liveMode && fillCount >= maxTrades && !killSwitchEngaged) {
                    notificationManager.notify('Test alert: Max trades reached in live-mode devnet.', 'all');
                    logger.warn('🚨 Live-Mode kill-switch engaged');
                    process.env.LIVE_MODE = 'false';
                    killSwitchEngaged = true;
                    printSummaryAndExit(fills, riskManager);
                }
            });
            orderManager.on('orderFailed', (order) => {
                logger.error(`[OrderFailedEvent] Signature: ${order.signature} Error: ${order.error}`);
            });
        }
        volatilitySqueeze.on('patternMatch', async (match) => {
            logger.info(`Volatility Squeeze detected for ${match.token.address}`);
            logger.info(`Suggested position size: ${match.suggestedPosition} SOL`);
            try {
                // Fetch Jupiter quote for token/SOL
                const inputMint = process.env.BASE_MINT || 'So11111111111111111111111111111111111111112'; // Use BASE_MINT (SOL default)
                const outputMint = match.token.address;
                if (inputMint === outputMint) {
                    logger.warn(`[SwapLogic] Skipping swap: inputMint and outputMint are the same (${inputMint})`);
                    return;
                }
                if (liveMode) {
                    // --- REAL JUPITER SWAP LOGIC (DEVNET) ---
                    // 1. Fetch Jupiter quote
                    const amount = Number(process.env.SIM_AMOUNT) || 1000000; // 0.001 SOL default (in lamports)
                    const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
                    const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
                    if (!quote) {
                        logger.warn('[JupiterQuote] No quote available for live swap');
                        return;
                    }
                    logger.info('[JupiterQuote]', JSON.stringify(quote));
                    // 2. Get swap transaction from Jupiter
                    const swapTxBase64 = quote && 'tx' in quote ? quote.tx : undefined;
                    if (!swapTxBase64) {
                        logger.error('[JupiterSwap] No swap transaction in quote');
                        return;
                    }
                    const { VersionedTransaction } = await import('@solana/web3.js');
                    const swapTxBuf = Buffer.from(String(swapTxBase64), 'base64');
                    const transaction = VersionedTransaction.deserialize(swapTxBuf);
                    // 3. Sign transaction with wallet
                    const signature = await signer.signAndSendTransaction(transaction, connection);
                    logger.info(`[OrderSubmitted] Signature: ${signature}`);
                    // Register with OrderManager for confirmation tracking (if supported for VersionedTransaction)
                    try {
                        // @ts-ignore - extend OrderManager if needed
                        orderManager.placeOrder(transaction);
                    }
                    catch (e) {
                        logger.warn('OrderManager.placeOrder not compatible with VersionedTransaction');
                    }
                    // Confirmation and fillCount handled by orderManager event
                    return;
                }
                const amount = Number(process.env.SIM_AMOUNT) || 1000000; // 0.001 SOL default (in lamports)
                const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
                const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
                if (quote) {
                    logger.info('[JupiterQuote] Quote:', quote);
                    logger.info('[JupiterQuote] Unsigned Tx:', quote && 'tx' in quote ? quote.tx : undefined);
                }
                else {
                    logger.warn('[JupiterQuote] No quote available');
                }
                // Simulate fill
                const action = 'buy';
                const fill = {
                    action: action,
                    tokenAddress: outputMint,
                    tokenSymbol: match.token.symbol,
                    quantity: amount / 1e9, // assuming 9 decimals for SOL
                    price: quote &&
                        typeof quote === 'object' &&
                        'price' in quote &&
                        typeof quote.price === 'number'
                        ? quote.price
                        : 0,
                    meta: { patternMatch: match, quote },
                };
                await handleDryRunFill(fill, riskManager);
                fills.push(fill);
                fillCount++;
                // --- LIVE MODE KILL-SWITCH & ALERT ---
                if (liveMode && fillCount >= maxTrades && !killSwitchEngaged) {
                    await notificationManager.notify('Test alert: Max trades reached in live-mode dry-run.', 'all');
                    logger.warn('🚨 Live-Mode kill-switch engaged');
                    // Flip kill switch
                    process.env.LIVE_MODE = 'false';
                    killSwitchEngaged = true;
                    // Print summary and exit
                    await printSummaryAndExit(fills, riskManager);
                }
            }
            catch (e) {
                logger.error('[DryRun] Error in simulated fill', e);
            }
        });
        // Start components
        await discovery.start();
        volatilitySqueeze.start();
        // Run for the specified number of minutes
        logger.info(`Starting dry-run simulation for ${minutes} minutes...`);
        await new Promise((resolve) => setTimeout(resolve, minutes * 60 * 1000));
        // Clean up
        discovery.stop();
        volatilitySqueeze.stop();
        // PnL summary
        await printSummaryAndExit(fills, riskManager);
        logger.info('Dry-run simulation completed');
    }
    catch (error) {
        logger.error('Error in dry-run simulation:', error);
        process.exit(1);
    }
}
async function printSummaryAndExit(fills, riskManager) {
    try {
        const { computePnLSummary } = await import('../src/utils/pnlStats.js');
        const summary = computePnLSummary(fills);
        const averagePnlPerTrade = fills.length ? summary.totalPnL / fills.length : 0;
        const summaryJson = {
            totalPnl: summary.totalPnL,
            maxDrawdown: summary.maxDrawdown,
            wins: summary.wins,
            losses: summary.losses,
            averagePnlPerTrade,
        };
        logger.info('[PnL Summary]', JSON.stringify(summaryJson));
        process.exit(0);
    }
    catch (e) {
        logger.error('[PnL Summary] Error computing summary', e);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=dry-vol-sim.js.map