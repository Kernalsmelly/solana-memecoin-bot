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
console.log('Cascade index.ts test: started');
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env") });
console.log("Loading .env from:", path_1.default.resolve(__dirname, "../.env"));
console.log("PRIVATE KEY ENV ▶", process.env.WALLET_SECRET_BASE58);
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
const tradeLogger_1 = require("./utils/tradeLogger");
const multiSourceTokenDetector_1 = require("./services/multiSourceTokenDetector");
const notificationManager_1 = require("./live/notificationManager");
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor"); // Correct import for Wallet
const bs58_1 = __importDefault(require("bs58"));
const orderExecution_1 = require("./orderExecution");
const riskManager_1 = require("./live/riskManager");
const exitManager_1 = require("./strategy/exitManager");
const persistence_1 = require("./utils/persistence");
const portfolioOptimizer_1 = require("./strategy/portfolioOptimizer");
const logger_1 = __importDefault(require("./utils/logger"));
const config_1 = require("./utils/config"); // USE NAMED IMPORT
const verifyConfig_1 = __importDefault(require("./utils/verifyConfig"));
const notifications_1 = require("./utils/notifications");
async function main() {
    logger_1.default.info('[DEBUG] Starting main()...');
    // Load and verify configuration first
    const validationResult = await (0, verifyConfig_1.default)(); // Remove 'config' argument
    if (!validationResult.isValid) {
        logger_1.default.error('Configuration validation failed. Please check .env file and logs.');
        if (validationResult.missingRequired.length > 0) {
            logger_1.default.error(`Missing required env vars: ${validationResult.missingRequired.join(', ')}`);
        }
        if (validationResult.riskParameters && validationResult.riskParameters.issues.length > 0) {
            logger_1.default.error(`Risk parameter issues: ${validationResult.riskParameters.issues.join(', ')}`);
        }
        if (!validationResult.walletStatus.valid) {
            logger_1.default.error(`Wallet validation error: ${validationResult.walletStatus.error}`);
        }
        if (!validationResult.rpcStatus.valid) {
            logger_1.default.error(`RPC validation error: ${validationResult.rpcStatus.error}`);
        }
        process.exit(1);
        // Log specific issues
        if (validationResult.missingRequired.length > 0) {
            logger_1.default.error(`Missing required env vars: ${validationResult.missingRequired.join(', ')}`);
        }
        if (validationResult.riskParameters && validationResult.riskParameters.issues.length > 0) {
            logger_1.default.error(`Risk parameter issues: ${validationResult.riskParameters.issues.join(', ')}`);
        }
        if (!validationResult.walletStatus.valid) {
            logger_1.default.error(`Wallet validation error: ${validationResult.walletStatus.error}`);
        }
        if (!validationResult.rpcStatus.valid) {
            logger_1.default.error(`RPC validation error: ${validationResult.rpcStatus.error}`);
        }
        process.exit(1);
    }
    logger_1.default.info('[DEBUG] Configuration verified successfully.');
    if (validationResult.missingRecommended.length > 0) {
        logger_1.default.warn(`Missing recommended env vars: ${validationResult.missingRecommended.join(', ')}`);
    }
    // Declare NotificationManager outside try block to use in catch
    let notificationManager = null;
    let wallet;
    let keypair;
    try {
        // Decode Private Key and create Wallet
        const privateKeyString = config_1.config.solana.walletPrivateKey.trim(); // Correct property name
        if (!privateKeyString) {
            throw new Error('WALLET_SECRET_BASE58 is missing or empty in config.');
        }
        const privateKeyBytes = bs58_1.default.decode(privateKeyString);
        keypair = web3_js_1.Keypair.fromSecretKey(privateKeyBytes);
        wallet = new anchor_1.Wallet(keypair);
        logger_1.default.info(`Wallet loaded: ${wallet.publicKey.toBase58()}`);
        // Initialize notification manager using config
        notificationManager = new notificationManager_1.NotificationManager({
            discord: config_1.config.notifications.discordWebhookUrl ? {
                webhookUrl: config_1.config.notifications.discordWebhookUrl
            } : undefined,
            telegram: config_1.config.notifications.telegramApiId && config_1.config.notifications.telegramApiHash && config_1.config.notifications.telegramSessionString && config_1.config.notifications.telegramChatId ? {
                apiId: config_1.config.notifications.telegramApiId,
                apiHash: config_1.config.notifications.telegramApiHash,
                sessionString: config_1.config.notifications.telegramSessionString, // Corrected property name usage
                chatId: config_1.config.notifications.telegramChatId
            } : undefined,
            notifyLevel: config_1.config.notifications.notifyLevel || 'all' // Corrected property name usage
        });
        // 1. Initialize Core Services using config
        logger_1.default.info(`Initializing core services...`);
        logger_1.default.info(`Using wallet: ${wallet.publicKey.toBase58()}`);
        const connection = new web3_js_1.Connection(config_1.config.solana.rpcEndpoint, 'confirmed');
        logger_1.default.info(`Connected to Solana RPC: ${config_1.config.solana.rpcEndpoint}`);
        // --- Initialize PriceWatcher after connection is defined ---
        logger_1.default.info('[DEBUG] Initializing PriceWatcher...');
        const priceWatcher = new (await Promise.resolve().then(() => __importStar(require('./services/priceWatcher')))).PriceWatcher(connection, config_1.config);
        logger_1.default.info('[DEBUG] PriceWatcher initialized.');
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        logger_1.default.warn('[FORCE] Adding USDC to PriceWatcher for pipeline test');
        priceWatcher.watchToken(USDC_MINT);
        logger_1.default.info('[DEBUG] Called priceWatcher.watchToken(USDC_MINT)');
        // --- Initialize MultiSourceTokenDetector ---
        const multiSourceTokenDetector = new multiSourceTokenDetector_1.MultiSourceTokenDetector();
        logger_1.default.info('[DEBUG] MultiSourceTokenDetector initialized.');
        // --- Wire MultiSourceTokenDetector event handler ---
        try {
            logger_1.default.info('[DEBUG] Wiring MultiSourceTokenDetector event handler...');
            multiSourceTokenDetector.on('newTokenDetected', async (evt) => {
                logger_1.default.info(`[MultiSourceTokenDetector] New token detected from ${evt.source}: ${evt.mint} (${evt.symbol || ''})`);
                priceWatcher.watchToken(evt.mint, evt.poolAddress);
                const detectedPattern = patternDetector?.detect(evt.metrics);
                if (!detectedPattern || detectedPattern.confidence < (portfolioOptimizer.getMinConfidence() ?? 0.7)) {
                    logger_1.default.info(`[NewPoolDetected] No strong pattern detected for ${evt.metrics?.symbol || detectedPattern?.baseMint}`);
                    return;
                }
                // 3. Attempt to open a position
                const newPosition = await portfolioOptimizer.evaluatePattern(detectedPattern);
                if (newPosition) {
                    logger_1.default.info(`[NewPoolDetected] Opened position for ${evt.metrics?.symbol || detectedPattern.baseMint} (${evt.metrics?.address || detectedPattern.baseMint})`);
                    // Always add new positions to ExitManager for monitoring
                    exitManager.addPosition(newPosition);
                    // --- Persist open positions after opening ---
                    try {
                        await (0, persistence_1.saveOpenPositions)(exitManager.getPositions());
                        logger_1.default.info('Saved open positions after opening new position.');
                    }
                    catch (err) {
                        if (err instanceof Error) {
                            logger_1.default.error(err.message, err.stack);
                        }
                        else {
                            logger_1.default.error(String(err));
                        }
                        logger_1.default.error('Failed to save open positions after opening:', err);
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
                        timestamp: newPosition.timestamp
                    };
                    notificationManager?.notifyTrade('open', openNotificationPayload);
                }
                else {
                    logger_1.default.info(`PortfolioOptimizer did not open a position for pattern ${detectedPattern.pattern} on ${evt.metrics?.symbol || detectedPattern.baseMint}.`);
                }
            });
            logger_1.default.info('[DEBUG] MultiSourceTokenDetector event handler wired.');
        }
        catch (e) {
            logger_1.default.error('[Startup] Error wiring MultiSourceTokenDetector:', e);
        }
        // Correctly pass only slippageBps to LiveOrderExecution options
        const orderExecution = new orderExecution_1.LiveOrderExecution(connection, keypair, {
            slippageBps: config_1.config.trading.jupiterSlippageBps // Use config
        });
        // Provide RiskManager configuration from config
        const riskManager = new riskManager_1.RiskManager({
            maxDrawdown: config_1.config.risk.maxDrawdownPercent,
            maxDailyLoss: config_1.config.risk.maxDailyLossPercent,
            maxPositions: config_1.config.risk.maxActivePositions, // Corrected property name
            maxPositionSize: config_1.config.trading.maxPositionSize, // Use trading.maxPositionSize (needs clarification SOL vs USD)
            maxPositionValueUsd: config_1.config.trading.targetPositionValueUsd, // Map from trading config
            maxLiquidityPercent: config_1.config.trading.maxLiquidityPercentage, // Corrected property name
            minPositionValueUsd: config_1.config.trading.minPositionValueUsd // Map from trading config
        });
        // Configure ExitManager with optimized settings from memory
        const exitManagerConfig = {
            timeBasedExits: {
                maxHoldingTimeHours: 24,
                quickProfitMinutes: 15,
                quickProfitThreshold: 10 // 10% profit in 15 minutes = exit
            },
            profitExits: {
                takeProfit: 30, // 30% profit target
                megaProfitExit: { threshold: 50, lockInPercent: 40 }, // Activate at 50%, lock in 40%
                superProfitExit: 150 // 150% = super profit exit
            },
            lossExits: {
                stopLoss: config_1.config.risk.defaultStopLossPercent * -1, // Use default SL from config
                timeBasedStopAdjustment: { afterMinutes: 60, newStopPercent: -5 } // Tighten stop after 1 hour
            },
            trailingStops: {
                enabled: config_1.config.risk.trailingStopEnabled ?? true,
                activationThreshold: config_1.config.risk.trailingStopActivationPercent ?? 15, // Start trailing at 15% profit
                trailPercent: config_1.config.risk.trailingStopTrailPercent ?? 10 // Trail by 10% of peak price
            },
            volatilityExits: {
                enabled: true,
                lookbackPeriods: 10,
                stdDevMultiplier: 2.5
            },
            // Pattern-specific rules based on our optimization results
            patternSpecificRules: {
                'Mega Pump and Dump': [
                    { type: 'profit', value: 50, description: 'Higher take profit for mega pumps' },
                    { type: 'trailing', value: 15, description: 'Tighter trailing for mega pumps' }
                ],
                'Volatility Squeeze': [
                    { type: 'profit', value: 40, description: 'Higher take profit for volatility squeeze' }
                ],
                'Smart Money Trap': [
                    { type: 'trailing', value: 8, description: 'Tighter trailing for smart money trap' }
                ]
            }
        };
        // --- RiskManager Event Wiring ---
        logger_1.default.info('Wiring RiskManager events to NotificationManager...');
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
        const exitManager = new exitManager_1.ExitManager(orderExecution, riskManager, undefined, exitManagerConfig);
        // 2. Initialize Portfolio Optimizer
        const portfolioOptimizer = new portfolioOptimizer_1.PortfolioOptimizer({
            orderExecution,
            riskManager,
            birdeyeApi: undefined, // We're not using BirdeyeAPI directly
            exitManager,
        });
        try {
            // Optionally keep NewCoinDetector for Raydium/legacy detection
            logger_1.default.info('Initializing New Coin Detector...');
            logger_1.default.info(`Using QuickNode RPC: ${config_1.config.solana.rpcEndpoint}`);
            logger_1.default.info(`Using QuickNode WSS: ${config_1.config.solana.wssEndpoint}`);
            exitManager.on('exitSignal', (position, executionResult, reason) => {
                logger_1.default.info(`<<< ExitManager closed position: ${position.tokenSymbol}, Reason: ${reason}`);
                logger_1.default.info(`<<< ExitManager closed position: ${position.tokenSymbol}, Reason: ${reason}`);
                let pnlPercent = 0; // Default PNL
                if (executionResult && executionResult.success && executionResult.outputAmount !== undefined && executionResult.outputAmount !== null) {
                    if (position.initialSolCostLamports !== undefined) {
                        const solReceivedLamports = executionResult.outputAmount;
                        const initialSolCostLamports = position.initialSolCostLamports;
                        const pnlLamports = BigInt(solReceivedLamports) - BigInt(initialSolCostLamports);
                        pnlPercent = initialSolCostLamports > 0n ? (Number(pnlLamports) / Number(initialSolCostLamports)) * 100 : 0;
                        logger_1.default.info(`Trade closed successfully. PNL: ${pnlLamports} lamports (${pnlPercent.toFixed(2)}%). Tx: ${executionResult.txSignature}`);
                    }
                    else {
                        logger_1.default.warn(`Cannot calculate SOL-based PNL for ${position.id}, initialSolCostLamports is missing. Reporting 0% PNL.`);
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
                    timestamp: executionResult?.timestamp || Date.now()
                };
                notificationManager?.notifyTrade('close', closeNotificationPayload);
            });
        }
        catch (err) {
            if (err instanceof Error) {
                logger_1.default.error(err.message, err.stack);
            }
            else {
                logger_1.default.error(String(err));
            }
            logger_1.default.error('[MAIN] Unhandled error in main():', err);
            await (0, notifications_1.sendAlert)(`[MAIN] Unhandled error in main(): ${err instanceof Error ? err.message : String(err)}`, 'CRITICAL');
        }
    } // closes main try
    catch (err) {
        if (err instanceof Error) {
            logger_1.default.error(err.message, err.stack);
        }
        else {
            logger_1.default.error(String(err));
        }
        logger_1.default.error('[MAIN] Unhandled error in main():', err);
        await (0, notifications_1.sendAlert)(`[MAIN] Unhandled error in main(): ${err instanceof Error ? err.message : String(err)}`, 'CRITICAL');
    }
} // closes main function
main().catch(error => {
    tradeLogger_1.tradeLogger.logScenario('UNHANDLED_MAIN_ERROR', {
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
    });
    logger_1.default.error('Error in main:', error);
    tradeLogger_1.tradeLogger.logScenario('EMERGENCY_STOP', {
        reason: 'Fatal error in main loop',
        error: error?.message || String(error),
        timestamp: new Date().toISOString()
    });
    process.exit(1);
});
//# sourceMappingURL=index.js.map