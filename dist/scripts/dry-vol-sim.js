"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const tokenDiscovery_1 = require("../src/discovery/tokenDiscovery");
const volatilitySqueeze_1 = require("../src/strategies/volatilitySqueeze");
const ParameterSweepManager_1 = require("../src/strategy/ParameterSweepManager");
const StrategyCoordinator_1 = require("../src/strategy/StrategyCoordinator");
const logger_1 = __importDefault(require("../src/utils/logger"));
const riskManager_1 = require("../src/live/riskManager");
const notificationManager_1 = require("../src/live/notificationManager");
const minimist_1 = __importDefault(require("minimist"));
const connectionManager_1 = __importDefault(require("../src/connectionManager"));
const signer_1 = require("../src/orderExecution/signer");
const orderManager_1 = require("../src/orderExecution/orderManager");
async function main() {
    try {
        // Parse CLI flags
        const argv = (0, minimist_1.default)(process.argv.slice(2));
        const maxTrades = argv['max-trades'] ? Number(argv['max-trades']) : Infinity;
        const minutes = argv['minutes'] ? Number(argv['minutes']) : 30;
        const liveMode = process.env.LIVE_MODE === 'true';
        // Notification manager for alerts (dummy config for now)
        const notificationManager = new notificationManager_1.NotificationManager({ notifyLevel: 'all' });
        // Initialize components with dry-run settings
        const discovery = new tokenDiscovery_1.TokenDiscovery({
            minLiquidity: 50000, // $50k minimum
            maxTokenAge: 24 * 60 * 60 * 1000, // 24 hours
            cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
        });
        // Parameter sweep grid (customize as needed)
        const paramGrid = [
            { priceChangeThreshold: 15, volumeMultiplier: 1.5 },
            { priceChangeThreshold: 20, volumeMultiplier: 2 },
            { priceChangeThreshold: 25, volumeMultiplier: 2.5 }
        ];
        const sweepManager = new ParameterSweepManager_1.ParameterSweepManager(paramGrid, 5); // 5 trades per batch
        sweepManager.on('ParameterUpdateEvent', (params) => {
            logger_1.default.info(`[ParameterUpdateEvent] New params: ${JSON.stringify(params)}`);
            // Update VolatilitySqueeze params on the fly
            volatilitySqueeze.setParams(params);
        });
        const initialParams = sweepManager.getCurrentParams();
        const volatilitySqueeze = new volatilitySqueeze_1.VolatilitySqueeze({
            ...initialParams,
            lookbackPeriodMs: 30 * 60 * 1000,
            checkIntervalMs: 60 * 1000
        });
        // Multi-token concurrency: setup strategy coordinator
        const coordinator = new StrategyCoordinator_1.StrategyCoordinator({ maxConcurrent: 3, cooldownMs: 2 * 60 * 1000 }); // 3 tokens, 2min cooldown
        discovery.on('tokenDiscovered', async (token) => {
            logger_1.default.info(`New token discovered: ${token.address}`);
            coordinator.enqueueToken(token.address);
        });
        volatilitySqueeze.on('patternMatch', async (match) => {
            coordinator.enqueueToken(match.token.address);
        });
        coordinator.on('tokenDispatch', async (tokenAddress) => {
            logger_1.default.info(`[Coordinator] Dispatching execution for token ${tokenAddress}`);
            // Insert execution logic here (swap, order, etc.)
            // For demo, just simulate a fill and call completeToken
            try {
                // Fetch Jupiter quote for token/SOL
                const inputMint = process.env.BASE_MINT || 'So11111111111111111111111111111111111111112';
                const outputMint = tokenAddress;
                if (inputMint === outputMint) {
                    logger_1.default.warn(`[SwapLogic] Skipping swap: inputMint and outputMint are the same (${inputMint})`);
                    coordinator.completeToken(tokenAddress);
                    return;
                }
                const amount = Number(process.env.SIM_AMOUNT) || 1000000;
                const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
                const { fetchJupiterQuote } = await Promise.resolve().then(() => __importStar(require('../src/orderExecution/jupiterQuote')));
                const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
                if (!quote) {
                    logger_1.default.warn('[JupiterQuote] No quote available for token', tokenAddress);
                    coordinator.completeToken(tokenAddress);
                    return;
                }
                logger_1.default.info('[JupiterQuote]', JSON.stringify(quote));
                // Simulate fill
                const fill = {
                    action: 'buy',
                    tokenAddress,
                    quantity: amount / 1e9,
                    price: quote.price || 0,
                    meta: { quote }
                };
                const { handleDryRunFill } = await Promise.resolve().then(() => __importStar(require('../src/orderExecution/dryRunFill')));
                await handleDryRunFill(fill, riskManager);
                fills.push(fill);
                fillCount++;
                coordinator.completeToken(tokenAddress);
            }
            catch (e) {
                logger_1.default.error(`[Coordinator] Execution error for ${tokenAddress}:`, e);
                coordinator.completeToken(tokenAddress);
            }
        });
        const fills = [];
        // Inject a real RiskManager for dry-run tracking
        const riskManager = new riskManager_1.RiskManager({
            maxDrawdown: 0.2,
            maxDailyLoss: 0.1,
            maxPositions: 5,
            maxPositionSize: 10
        });
        let fillCount = 0;
        let killSwitchEngaged = false;
        // Live-mode: set up connection, signer, and order manager
        let connection;
        let signer;
        let orderManager;
        if (liveMode) {
            connection = await connectionManager_1.default.getInstance().getConnection();
            signer = new signer_1.EnvVarSigner();
            orderManager = new orderManager_1.OrderManager(connection, signer);
            orderManager.on('orderFilled', (order) => {
                logger_1.default.info(`[OrderConfirmedEvent] Signature: ${order.signature} Status: ${order.status}`);
                fills.push({
                    ...order,
                    confirmed: true,
                });
                fillCount++;
                // Risk manager update
                riskManager.recordTrade(0); // Replace 0 with actual PnL if available
                sweepManager.recordTrade(order.pnl ?? 0); // Track PnL for parameter sweep
                // --- Automated parameter sweep feedback (live mode) ---
                if (liveMode && sweepManager.getHistory().length > 0 && sweepManager.getHistory().length % 2 === 0) { // every 2 batches for demo
                    // Run a local sweep around the current params
                    const lastBest = sweepManager.getCurrentParams();
                    const sweepGrid = [
                        { priceChangeThreshold: lastBest.priceChangeThreshold - 2, volumeMultiplier: lastBest.volumeMultiplier },
                        { priceChangeThreshold: lastBest.priceChangeThreshold, volumeMultiplier: lastBest.volumeMultiplier },
                        { priceChangeThreshold: lastBest.priceChangeThreshold + 2, volumeMultiplier: lastBest.volumeMultiplier },
                        { priceChangeThreshold: lastBest.priceChangeThreshold, volumeMultiplier: lastBest.volumeMultiplier - 0.2 },
                        { priceChangeThreshold: lastBest.priceChangeThreshold, volumeMultiplier: lastBest.volumeMultiplier + 0.2 }
                    ];
                    let bestSharpe = -Infinity, bestParams = lastBest;
                    for (const params of sweepGrid) {
                        // Simulate performance (replace with real backtest if available)
                        const mockPnls = sweepManager.getHistory().slice(-2).map(b => b.totalPnL + Math.random() - 0.5); // mock
                        const mean = mockPnls.reduce((a, b) => a + b, 0) / mockPnls.length;
                        const std = Math.sqrt(mockPnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (mockPnls.length || 1));
                        const sharpe = std ? mean / std : mean;
                        if (sharpe > bestSharpe) {
                            bestSharpe = sharpe;
                            bestParams = params;
                        }
                    }
                    logger_1.default.info(`[ParamSweep] Feedback sweep complete. Best params: ${JSON.stringify(bestParams)} (Sharpe-like: ${bestSharpe.toFixed(2)})`);
                    volatilitySqueeze.setParams(bestParams);
                    sweepManager.emit('ParameterUpdateEvent', bestParams);
                }
                if (liveMode && fillCount >= maxTrades && !killSwitchEngaged) {
                    notificationManager.notify('Test alert: Max trades reached in live-mode devnet.', 'all');
                    logger_1.default.warn('🚨 Live-Mode kill-switch engaged');
                    process.env.LIVE_MODE = 'false';
                    killSwitchEngaged = true;
                    printSummaryAndExit(fills, riskManager);
                }
            });
            orderManager.on('orderFailed', (order) => {
                logger_1.default.error(`[OrderFailedEvent] Signature: ${order.signature} Error: ${order.error}`);
            });
        }
        volatilitySqueeze.on('patternMatch', async (match) => {
            logger_1.default.info(`Volatility Squeeze detected for ${match.token.address}`);
            logger_1.default.info(`Suggested position size: ${match.suggestedPosition} SOL`);
            try {
                // Fetch Jupiter quote for token/SOL
                const inputMint = process.env.BASE_MINT || 'So11111111111111111111111111111111111111112'; // Use BASE_MINT (SOL default)
                const outputMint = match.token.address;
                if (inputMint === outputMint) {
                    logger_1.default.warn(`[SwapLogic] Skipping swap: inputMint and outputMint are the same (${inputMint})`);
                    return;
                }
                if (liveMode) {
                    // --- REAL JUPITER SWAP LOGIC (DEVNET) ---
                    // 1. Fetch Jupiter quote
                    const amount = Number(process.env.SIM_AMOUNT) || 1000000; // 0.001 SOL default (in lamports)
                    const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
                    const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
                    if (!quote) {
                        logger_1.default.warn('[JupiterQuote] No quote available for live swap');
                        return;
                    }
                    logger_1.default.info('[JupiterQuote]', JSON.stringify(quote));
                    // 2. Get swap transaction from Jupiter
                    const swapTxBase64 = quote.tx;
                    if (!swapTxBase64) {
                        logger_1.default.error('[JupiterSwap] No swap transaction in quote');
                        return;
                    }
                    const { VersionedTransaction } = await Promise.resolve().then(() => __importStar(require('@solana/web3.js')));
                    const swapTxBuf = Buffer.from(swapTxBase64, 'base64');
                    const transaction = VersionedTransaction.deserialize(swapTxBuf);
                    // 3. Sign transaction with wallet
                    const signature = await signer.signAndSendTransaction(transaction, connection);
                    logger_1.default.info(`[OrderSubmitted] Signature: ${signature}`);
                    // Register with OrderManager for confirmation tracking (if supported for VersionedTransaction)
                    try {
                        // @ts-ignore - extend OrderManager if needed
                        orderManager.placeOrder(transaction);
                    }
                    catch (e) {
                        logger_1.default.warn('OrderManager.placeOrder not compatible with VersionedTransaction');
                    }
                    // Confirmation and fillCount handled by orderManager event
                    return;
                }
                const amount = Number(process.env.SIM_AMOUNT) || 1000000; // 0.001 SOL default (in lamports)
                const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
                const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
                if (quote) {
                    logger_1.default.info('[JupiterQuote] Quote:', quote);
                    logger_1.default.info('[JupiterQuote] Unsigned Tx:', quote.tx);
                }
                else {
                    logger_1.default.warn('[JupiterQuote] No quote available');
                }
                // Simulate fill
                const action = 'buy';
                const fill = {
                    action: action,
                    tokenAddress: outputMint,
                    tokenSymbol: match.token.symbol,
                    quantity: amount / 1e9, // assuming 9 decimals for SOL
                    price: quote?.price || 0,
                    meta: { patternMatch: match, quote }
                };
                await handleDryRunFill(fill, riskManager);
                fills.push(fill);
                fillCount++;
                // --- LIVE MODE KILL-SWITCH & ALERT ---
                if (liveMode && fillCount >= maxTrades && !killSwitchEngaged) {
                    await notificationManager.notify('Test alert: Max trades reached in live-mode dry-run.', 'all');
                    logger_1.default.warn('🚨 Live-Mode kill-switch engaged');
                    // Flip kill switch
                    process.env.LIVE_MODE = 'false';
                    killSwitchEngaged = true;
                    // Print summary and exit
                    await printSummaryAndExit(fills, riskManager);
                }
            }
            catch (e) {
                logger_1.default.error('[DryRun] Error in simulated fill', e);
            }
        });
        // Start components
        await discovery.start();
        volatilitySqueeze.start();
        // Run for the specified number of minutes
        logger_1.default.info(`Starting dry-run simulation for ${minutes} minutes...`);
        await new Promise(resolve => setTimeout(resolve, minutes * 60 * 1000));
        // Clean up
        discovery.stop();
        volatilitySqueeze.stop();
        // PnL summary
        await printSummaryAndExit(fills, riskManager);
        logger_1.default.info('Dry-run simulation completed');
    }
    catch (error) {
        logger_1.default.error('Error in dry-run simulation:', error);
        process.exit(1);
    }
}
async function printSummaryAndExit(fills, riskManager) {
    try {
        const { computePnLSummary } = await Promise.resolve().then(() => __importStar(require('../src/utils/pnlStats')));
        const summary = computePnLSummary(fills);
        const averagePnlPerTrade = fills.length ? summary.totalPnL / fills.length : 0;
        const summaryJson = {
            totalPnl: summary.totalPnL,
            maxDrawdown: summary.maxDrawdown,
            wins: summary.wins,
            losses: summary.losses,
            averagePnlPerTrade
        };
        logger_1.default.info('[PnL Summary]', JSON.stringify(summaryJson));
        process.exit(0);
    }
    catch (e) {
        logger_1.default.error('[PnL Summary] Error computing summary', e);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=dry-vol-sim.js.map