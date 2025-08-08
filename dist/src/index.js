console.log('Cascade index.ts test: started');
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
console.log('Loading .env from:', path.resolve(__dirname, '../.env'));
console.log('PRIVATE KEY ENV ▶', process.env.WALLET_SECRET_BASE58);
// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
    if (reason instanceof Error) {
        console.error('[GLOBAL] Unhandled Rejection:', reason.message, reason.stack);
    }
    else {
        console.error('[GLOBAL] Unhandled Rejection:', String(reason));
    }
});
process.on('uncaughtException', (err) => {
    if (err instanceof Error) {
        console.error('[GLOBAL] Uncaught Exception:', err.message, err.stack);
    }
    else {
        console.error('[GLOBAL] Uncaught Exception:', String(err));
    }
});
import { MempoolSniffer } from './utils/mempoolSniffer.js';
import { WhaleSignalWatcher } from './utils/whaleSignalWatcher.js';
import { ForcedPumpManager } from './utils/forcedPumpManager.js';
import { tradeLogger } from './/utils/tradeLogger.js';
import { MultiSourceTokenDetector, } from './/services/multiSourceTokenDetector.js';
import { NotificationManager } from './/live/notificationManager.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor'; // Correct import for Wallet
import bs58 from 'bs58';
import { LiveOrderExecution } from './orderExecution.js';
import { RiskManager } from './live/riskManager.js';
import { ExitManager } from './strategy/exitManager.js';
import { saveOpenPositions } from './utils/persistence.js';
import { PortfolioOptimizer } from './strategy/portfolioOptimizer.js';
import logger from './utils/logger.js';
import { config } from './utils/config.js';
import verifyConfig from './utils/verifyConfig.js';
import { sendAlert } from './utils/notifications.js';
async function main() {
    logger.info('[DEBUG] Starting main()...');
    // Load and verify configuration first
    const validationResult = await verifyConfig(); // Remove 'config' argument
    if (!validationResult.isValid) {
        logger.error('Configuration validation failed. Please check .env file and logs.');
        if (validationResult.missingRequired.length > 0) {
            logger.error(`Missing required env vars: ${validationResult.missingRequired.join(', ')}`);
        }
        if (validationResult.riskParameters && validationResult.riskParameters.issues.length > 0) {
            logger.error(`Risk parameter issues: ${validationResult.riskParameters.issues.join(', ')}`);
        }
        if (!validationResult.walletStatus.valid) {
            logger.error(`Wallet validation error: ${validationResult.walletStatus.error}`);
        }
        if (!validationResult.rpcStatus.valid) {
            logger.error(`RPC validation error: ${validationResult.rpcStatus.error}`);
        }
        process.exit(1);
        // Log specific issues
        if (validationResult.missingRequired.length > 0) {
            logger.error(`Missing required env vars: ${validationResult.missingRequired.join(', ')}`);
        }
        if (validationResult.riskParameters && validationResult.riskParameters.issues.length > 0) {
            logger.error(`Risk parameter issues: ${validationResult.riskParameters.issues.join(', ')}`);
        }
        if (!validationResult.walletStatus.valid) {
            logger.error(`Wallet validation error: ${validationResult.walletStatus.error}`);
        }
        if (!validationResult.rpcStatus.valid) {
            logger.error(`RPC validation error: ${validationResult.rpcStatus.error}`);
        }
        process.exit(1);
    }
    logger.info('[DEBUG] Configuration verified successfully.');
    if (validationResult.missingRecommended.length > 0) {
        logger.warn(`Missing recommended env vars: ${validationResult.missingRecommended.join(', ')}`);
    }
    // Declare NotificationManager outside try block to use in catch
    let notificationManager = null;
    let wallet;
    let keypair;
    try {
        // Decode Private Key and create Wallet
        const privateKeyString = config.solana.walletPrivateKey.trim(); // Correct property name
        if (!privateKeyString) {
            throw new Error('WALLET_SECRET_BASE58 is missing or empty in config.');
        }
        const privateKeyBytes = bs58.decode(privateKeyString);
        keypair = Keypair.fromSecretKey(privateKeyBytes);
        wallet = new Wallet(keypair);
        logger.info(`Wallet loaded: ${wallet.publicKey.toBase58()}`);
        // Initialize notification manager using config
        notificationManager = new NotificationManager({
            // discord: config.notifications.discordWebhookUrl ? {
            //     webhookUrl: config.notifications.discordWebhookUrl
            // } : undefined,
            // telegram: config.notifications.telegramApiId && config.notifications.telegramApiHash && config.notifications.telegramSessionString && config.notifications.telegramChatId ? {
            //     apiId: config.notifications.telegramApiId,
            //     apiHash: config.notifications.telegramApiHash,
            //     sessionString: config.notifications.telegramSessionString, // Corrected property name usage
            //     chatId: config.notifications.telegramChatId
            // } : undefined,
            notifyLevel: config.notifications.notifyLevel || 'all', // Corrected property name usage
        });
        // 1. Initialize Core Services using config
        logger.info(`Initializing core services...`);
        logger.info(`Using wallet: ${wallet.publicKey.toBase58()}`);
        const connection = new Connection(config.solana.rpcEndpoint, 'confirmed');
        logger.info(`Connected to Solana RPC: ${config.solana.rpcEndpoint}`);
        // --- Initialize and start MempoolSniffer for ultra-fast LP/mint detection ---
        const forcedPumpManager = new ForcedPumpManager(connection, keypair, {
            waitSec: Number(process.env.FORCED_PUMP_WAIT_SEC || 0),
            pumpSizeSol: config.trading.forcedPumpSizeSol ?? 0.0005,
        });
        const mempoolSniffer = new MempoolSniffer(connection);
        mempoolSniffer.on('mintDetected', async (mintAddress, tx) => {
            try {
                logger.info(`[MempoolSniffer] Detected SPL Token Mint: ${mintAddress}`);
                // TODO: Increment Prometheus metric for mempool_events_total
                await priceWatcher.watchToken(mintAddress);
                logger.info(`[MempoolSniffer] Called priceWatcher.watchToken(${mintAddress})`);
                // Forced pump on mempool event if enabled
                if (config.trading.forcePumpOnMempool) {
                    logger.info(`[ForcedPump] Attempting forced pump for ${mintAddress} due to mempool event`);
                    forcedPumpManager
                        .maybeForcePump(new PublicKey(mintAddress), false)
                        .then((executed) => {
                        if (executed)
                            logger.info(`[ForcedPump] Forced pump executed for ${mintAddress}`);
                    });
                }
                // Synthesize a MultiSourceTokenEvent for the pipeline
                multiSourceTokenDetector.emit('newTokenDetected', {
                    source: 'mempool',
                    mint: mintAddress,
                    poolAddress: '',
                    metrics: { mint: mintAddress, detectedBy: 'mempool', tx },
                    symbol: '',
                });
            }
            catch (err) {
                logger.error('[MempoolSniffer] Error handling mintDetected:', err);
            }
        });
        mempoolSniffer.on('lpAddDetected', async (lpAddress, mintAddress, tx) => {
            try {
                logger.info(`[MempoolSniffer] Detected LP Add: LP=${lpAddress}, Mint=${mintAddress}`);
                // TODO: Increment Prometheus metric for mempool_events_total
                await priceWatcher.watchToken(mintAddress);
                logger.info(`[MempoolSniffer] Called priceWatcher.watchToken(${mintAddress})`);
                // Forced pump on mempool event if enabled
                if (config.trading.forcePumpOnMempool) {
                    logger.info(`[ForcedPump] Attempting forced pump for ${mintAddress} due to mempool event`);
                    forcedPumpManager
                        .maybeForcePump(new PublicKey(mintAddress), false)
                        .then((executed) => {
                        if (executed)
                            logger.info(`[ForcedPump] Forced pump executed for ${mintAddress}`);
                    });
                }
                // Synthesize a MultiSourceTokenEvent for the pipeline
                multiSourceTokenDetector.emit('newTokenDetected', {
                    source: 'mempool',
                    mint: mintAddress,
                    poolAddress: lpAddress,
                    metrics: { mint: mintAddress, pool: lpAddress, detectedBy: 'mempool', tx },
                    symbol: '',
                });
            }
            catch (err) {
                logger.error('[MempoolSniffer] Error handling lpAddDetected:', err);
            }
        });
        // Start the sniffer asynchronously (non-blocking)
        mempoolSniffer.start().catch((e) => logger.error('[MempoolSniffer] Failed to start:', e));
        // --- Whale Signal Integration ---
        // Use USDC mint and threshold from config/env
        const usdcMint = config.solana.usdcMint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const whaleThreshold = Number(process.env.WHALE_SIGNAL_USDC || 50000); // $50k default
        const whaleSignalWatcher = new WhaleSignalWatcher(connection, usdcMint, whaleThreshold);
        whaleSignalWatcher.on('whaleSignal', (event) => {
            try {
                logger.info(`[WhaleSignal] Whale trade detected: ${event.usdcAmount} USDC to pool ${event.poolAddress}`);
                // TODO: Increment Prometheus metric for whale_signals_total
                // Forced pump on whale event if enabled
                if (config.trading.forcePumpOnWhale) {
                    logger.info(`[ForcedPump] Attempting forced pump for ${event.tokenMint} due to whale event`);
                    forcedPumpManager
                        .maybeForcePump(new PublicKey(event.tokenMint), false)
                        .then((executed) => {
                        if (executed)
                            logger.info(`[ForcedPump] Forced pump executed for ${event.tokenMint}`);
                    });
                }
                // Synthesize a MultiSourceTokenEvent for the pipeline
                multiSourceTokenDetector.emit('newTokenDetected', {
                    source: 'whale',
                    mint: event.tokenMint,
                    poolAddress: event.poolAddress,
                    metrics: { ...event, detectedBy: 'whale' },
                    symbol: '',
                });
            }
            catch (err) {
                logger.error('[WhaleSignal] Error handling whaleSignal:', err);
            }
        });
        whaleSignalWatcher.start();
        // --- Initialize PriceWatcher after connection is defined ---
        logger.info('[DEBUG] Initializing PriceWatcher...');
        const priceWatcher = new (await import('./services/priceWatcher.js')).PriceWatcher(connection, config);
        logger.info('[DEBUG] PriceWatcher initialized.');
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        logger.warn('[FORCE] Adding USDC to PriceWatcher for pipeline test');
        priceWatcher.watchToken(USDC_MINT);
        logger.info('[DEBUG] Called priceWatcher.watchToken(USDC_MINT)');
        // --- Initialize MultiSourceTokenDetector ---
        const multiSourceTokenDetector = new MultiSourceTokenDetector();
        logger.info('[DEBUG] MultiSourceTokenDetector initialized.');
        // --- Wire up pre-signed transaction template creation for new pools ---
        import { TokenDiscovery } from './discovery/tokenDiscovery.js';
        import { TxnBuilder } from './services/txnBuilder.js';
        import { wireTemplateCreation } from './strategy/wireTemplates.js';
        const tokenDiscovery = new TokenDiscovery(connection);
        const txnBuilder = new TxnBuilder(connection, keypair);
        wireTemplateCreation(tokenDiscovery, txnBuilder, [keypair]);
        wireFastTradeExecution(patternDetector, txnBuilder, [keypair]);
        // --- Wire MultiSourceTokenDetector event handler ---
        try {
            logger.info('[DEBUG] Wiring MultiSourceTokenDetector event handler...');
            multiSourceTokenDetector.on('newTokenDetected', async (evt) => {
                logger.info(`[MultiSourceTokenDetector] New token detected from ${evt.source}: ${evt.mint} (${evt.symbol || ''})`);
                priceWatcher.watchToken(evt.mint, evt.poolAddress);
                const detectedPattern = patternDetector?.detect(evt.metrics);
                if (!detectedPattern ||
                    detectedPattern.confidence < (portfolioOptimizer.getMinConfidence() ?? 0.7)) {
                    logger.info(`[NewPoolDetected] No strong pattern detected for ${evt.metrics?.symbol || detectedPattern?.baseMint}`);
                    return;
                }
                // 3. Attempt to open a position
                const newPosition = await portfolioOptimizer.evaluatePattern(detectedPattern);
                if (newPosition) {
                    logger.info(`[NewPoolDetected] Opened position for ${evt.metrics?.symbol || detectedPattern.baseMint} (${evt.metrics?.address || detectedPattern.baseMint})`);
                    // Always add new positions to ExitManager for monitoring
                    exitManager.addPosition(newPosition);
                    // --- Persist open positions after opening ---
                    try {
                        await saveOpenPositions(exitManager.getPositions());
                        logger.info('Saved open positions after opening new position.');
                    }
                    catch (err) {
                        if (err instanceof Error) {
                            logger.error(err.message, err.stack);
                        }
                        else {
                            logger.error(String(err));
                        }
                        logger.error('Failed to save open positions after opening:', err);
                    }
                    // Prepare payload for notification (matches Position interface)
                    const quantityDecimal = Number(newPosition.quantity) / Math.pow(10, newPosition.tokenDecimals);
                    const sizeUsd = quantityDecimal * newPosition.currentPrice;
                    const openNotificationPayload = {
                        id: newPosition.id,
                        tokenAddress: newPosition.tokenAddress,
                        tokenSymbol: newPosition.tokenSymbol,
                        tokenMint: newPosition.tokenMint,
                        tokenDecimals: newPosition.tokenDecimals,
                        quantity: quantityDecimal,
                        entryPrice: newPosition.entryPrice,
                        currentPrice: newPosition.currentPrice,
                        size: sizeUsd,
                        stopLoss: newPosition.stopLoss ?? 0,
                        takeProfit: newPosition.takeProfit ?? 0,
                        pnl: 0,
                        status: 'open',
                        timestamp: newPosition.timestamp,
                    };
                    notificationManager?.notifyTrade(openNotificationPayload);
                }
                else {
                    logger.info(`PortfolioOptimizer did not open a position for pattern ${detectedPattern.pattern} on ${evt.metrics?.symbol || detectedPattern.baseMint}.`);
                }
            });
            logger.info('[DEBUG] MultiSourceTokenDetector event handler wired.');
        }
        catch (e) {
            logger.error('[Startup] Error wiring MultiSourceTokenDetector:', e);
        }
        // Correctly pass only slippageBps to LiveOrderExecution options
        const orderExecution = new LiveOrderExecution(connection, keypair, {
            slippageBps: config.trading.jupiterSlippageBps, // Use config
        });
        // Provide RiskManager configuration from config
        const riskManager = new RiskManager({
            maxDrawdown: config.risk.maxDrawdownPercent,
            maxDailyLoss: config.risk.maxDailyLossPercent,
            maxPositions: config.risk.maxActivePositions, // Corrected property name
            maxPositionSize: config.trading.maxPositionSize, // Use trading.maxPositionSize (needs clarification SOL vs USD)
            maxPositionValueUsd: config.trading.targetPositionValueUsd, // Map from trading config
            maxLiquidityPercent: config.trading.maxLiquidityPercentage, // Corrected property name
            minPositionValueUsd: config.trading.minPositionValueUsd, // Map from trading config
        });
        // Configure ExitManager with optimized settings from memory
        const exitManagerConfig = {
            timeBasedExits: {
                maxHoldingTimeHours: 24,
                quickProfitMinutes: 15,
                quickProfitThreshold: 10, // 10% profit in 15 minutes = exit
            },
            profitExits: {
                takeProfit: 30, // 30% profit target
                megaProfitExit: { threshold: 50, lockInPercent: 40 }, // Activate at 50%, lock in 40%
                superProfitExit: 150, // 150% = super profit exit
            },
            lossExits: {
                stopLoss: config.risk.defaultStopLossPercent * -1, // Use default SL from config
                timeBasedStopAdjustment: { afterMinutes: 60, newStopPercent: -5 }, // Tighten stop after 1 hour
            },
            trailingStops: {
                enabled: config.risk.trailingStopEnabled ?? true,
                activationThreshold: config.risk.trailingStopActivationPercent ?? 15, // Start trailing at 15% profit
                trailPercent: config.risk.trailingStopTrailPercent ?? 10, // Trail by 10% of peak price
            },
            volatilityExits: {
                enabled: true,
                lookbackPeriods: 10,
                stdDevMultiplier: 2.5,
            },
            // Pattern-specific rules based on our optimization results
            patternSpecificRules: {
                'Mega Pump and Dump': [
                    { type: 'profit', value: 50, description: 'Higher take profit for mega pumps' },
                    { type: 'trailing', value: 15, description: 'Tighter trailing for mega pumps' },
                ],
                'Volatility Squeeze': [
                    { type: 'profit', value: 40, description: 'Higher take profit for volatility squeeze' },
                ],
                'Smart Money Trap': [
                    { type: 'trailing', value: 8, description: 'Tighter trailing for smart money trap' },
                ],
            },
        };
        // --- RiskManager Event Wiring ---
        logger.info('Wiring RiskManager events to NotificationManager...');
        riskManager.on('circuitBreaker', async ({ reason, message, timestamp }) => {
            if (notificationManager) {
                await notificationManager.notify(`🚨 Circuit Breaker Triggered: ${reason}\n${message || ''}\nTime: ${new Date(timestamp).toLocaleString()}`, 'errors');
            }
        });
        riskManager.on('circuitBreakerReset', async ({ reason, timestamp }) => {
            if (notificationManager) {
                await notificationManager.notify(`✅ Circuit Breaker Reset: ${reason}\nTime: ${new Date(timestamp).toLocaleString()}`, 'all');
            }
        });
        riskManager.on('emergencyStop', async ({ reason, timestamp }) => {
            if (notificationManager) {
                await notificationManager.notify(`🛑 EMERGENCY STOP: ${reason}\nTime: ${new Date(timestamp).toLocaleString()}`, 'errors');
            }
        });
        riskManager.on('emergencyStopReset', async ({ timestamp }) => {
            if (notificationManager) {
                await notificationManager.notify(`🟢 Emergency Stop Reset\nTime: ${new Date(timestamp).toLocaleString()}`, 'all');
            }
        });
        riskManager.on('systemEnabled', async ({ timestamp }) => {
            if (notificationManager) {
                await notificationManager.notify(`✅ Trading System ENABLED\nTime: ${new Date(timestamp).toLocaleString()}`, 'all');
            }
        });
        riskManager.on('systemDisabled', async ({ timestamp }) => {
            if (notificationManager) {
                await notificationManager.notify(`⛔ Trading System DISABLED\nTime: ${new Date(timestamp).toLocaleString()}`, 'errors');
            }
        });
        // Initialize ExitManager with null for API client since we're not using it directly
        const exitManager = new ExitManager(orderExecution, riskManager, undefined, exitManagerConfig);
        // 2. Initialize Portfolio Optimizer
        const portfolioOptimizer = new PortfolioOptimizer({
            orderExecution,
            riskManager,
            birdeyeApi: undefined, // We're not using BirdeyeAPI directly
            exitManager,
        });
        try {
            // Optionally keep NewCoinDetector for Raydium/legacy detection
            logger.info('Initializing New Coin Detector...');
            logger.info(`Using QuickNode RPC: ${config.solana.rpcEndpoint}`);
            logger.info(`Using QuickNode WSS: ${config.solana.wssEndpoint}`);
            exitManager.on('exitSignal', (position, executionResult, reason) => {
                logger.info(`<<< ExitManager closed position: ${position.tokenSymbol}, Reason: ${reason}`);
                logger.info(`<<< ExitManager closed position: ${position.tokenSymbol}, Reason: ${reason}`);
                let pnlPercent = 0; // Default PNL
                if (executionResult &&
                    executionResult.success &&
                    executionResult.outputAmount !== undefined &&
                    executionResult.outputAmount !== null) {
                    if (position.initialSolCostLamports !== undefined) {
                        const solReceivedLamports = executionResult.outputAmount;
                        const initialSolCostLamports = position.initialSolCostLamports;
                        const pnlLamports = BigInt(solReceivedLamports) - BigInt(initialSolCostLamports);
                        pnlPercent =
                            initialSolCostLamports > 0n
                                ? (Number(pnlLamports) / Number(initialSolCostLamports)) * 100
                                : 0;
                        logger.info(`Trade closed successfully. PNL: ${pnlLamports} lamports (${pnlPercent.toFixed(2)}%). Tx: ${executionResult.txSignature}`);
                    }
                    else {
                        logger.warn(`Cannot calculate SOL-based PNL for ${position.id}, initialSolCostLamports is missing. Reporting 0% PNL.`);
                    }
                }
                const exitPrice = executionResult?.actualExecutionPrice ?? position.currentPrice;
                const quantityDecimal = Number(position.quantity) / Math.pow(10, position.tokenDecimals);
                const sizeUsd = quantityDecimal * exitPrice;
                const closeNotificationPayload = {
                    id: position.id,
                    tokenAddress: position.tokenAddress,
                    tokenSymbol: position.tokenSymbol,
                    tokenMint: position.tokenMint,
                    tokenDecimals: position.tokenDecimals,
                    quantity: quantityDecimal,
                    entryPrice: position.entryPrice,
                    currentPrice: exitPrice,
                    size: sizeUsd,
                    stopLoss: position.stopLoss ?? 0,
                    takeProfit: position.takeProfit ?? 0,
                    pnl: pnlPercent,
                    status: 'closed',
                    timestamp: executionResult?.timestamp || Date.now(),
                };
                notificationManager?.notifyTrade(closeNotificationPayload);
            });
        }
        catch (err) {
            if (err instanceof Error) {
                logger.error(err.message, err.stack);
            }
            else {
                logger.error(String(err));
            }
            logger.error('[MAIN] Unhandled error in main():', err);
            await sendAlert(`[MAIN] Unhandled error in main(): ${err instanceof Error ? err.message : String(err)}`, 'CRITICAL');
        }
    }
    catch (err) {
        // closes main try
        if (err instanceof Error) {
            logger.error(err.message, err.stack);
        }
        else {
            logger.error(String(err));
        }
        logger.error('[MAIN] Unhandled error in main():', err);
        await sendAlert(`[MAIN] Unhandled error in main(): ${err instanceof Error ? err.message : String(err)}`, 'CRITICAL');
    }
} // closes main function
main().catch((error) => {
    tradeLogger.logScenario('UNHANDLED_MAIN_ERROR', {
        error: error?.message || String(error),
        timestamp: new Date().toISOString(),
    });
    logger.error('Error in main:', error);
    tradeLogger.logScenario('EMERGENCY_STOP', {
        reason: 'Fatal error in main loop',
        error: error?.message || String(error),
        timestamp: new Date().toISOString(),
    });
    process.exit(1);
});
//# sourceMappingURL=index.js.map