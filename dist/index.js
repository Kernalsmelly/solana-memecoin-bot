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
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path")); // Import path module
// Load .env file from project root first thing
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env') });
const newCoinDetector_1 = require("./services/newCoinDetector");
const notificationManager_1 = require("./live/notificationManager");
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor"); // Correct import for Wallet
const bs58_1 = __importDefault(require("bs58"));
const orderExecution_1 = require("./orderExecution");
const riskManager_1 = require("./live/riskManager");
const exitManager_1 = require("./strategy/exitManager");
const portfolioOptimizer_1 = require("./strategy/portfolioOptimizer");
const logger_1 = __importDefault(require("./utils/logger"));
const config_1 = require("./utils/config"); // USE NAMED IMPORT
const verifyConfig_1 = __importDefault(require("./utils/verifyConfig")); // Import default verifyConfig function
// --- Environment Variable Validation ---
if (!process.env.SOLANA_RPC_URL || !process.env.SOLANA_PRIVATE_KEY) {
    logger_1.default.error('Missing required environment variables: SOLANA_RPC_URL, SOLANA_PRIVATE_KEY');
    process.exit(1);
}
// --- Main Application Setup ---
async function main() {
    // Load and verify configuration first
    const validationResult = await (0, verifyConfig_1.default)(); // Remove 'config' argument
    if (!validationResult.isValid) {
        logger_1.default.error('Configuration validation failed. Please check .env file and logs.');
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
    logger_1.default.info('Configuration verified successfully.');
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
            throw new Error('SOLANA_PRIVATE_KEY is missing or empty in config.');
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
        // TODO: Refine ExitManager config loading
        const exitManagerConfig = {
            // Example overrides - consider moving to config file/structure
            lossExits: { stopLoss: config_1.config.risk.defaultStopLossPercent * -1 }, // Use default SL from config
            trailingStops: {
                // Provide defaults for optional trailing stop config
                enabled: config_1.config.risk.trailingStopEnabled ?? false,
                activationThreshold: config_1.config.risk.trailingStopActivationPercent ?? 5,
                trailPercent: config_1.config.risk.trailingStopTrailPercent ?? 2
            },
            // Add other exit reasons from config if available
        };
        // TODO: Update ExitManager to accept a generic API client interface if needed for price data
        const exitManager = new exitManager_1.ExitManager(orderExecution, riskManager, undefined, exitManagerConfig); // Pass undefined for API client
        // 2. Initialize Portfolio Optimizer
        const portfolioOptimizer = new portfolioOptimizer_1.PortfolioOptimizer({
            orderExecution: orderExecution,
            riskManager: riskManager,
            // TODO: Update PortfolioOptimizer to accept a generic client interface
            birdeyeApi: undefined, // Pass undefined for API client
            exitManager: exitManager, // PortfolioOptimizer needs ExitManager ref
            maxPortfolioAllocationPercent: config_1.config.risk.maxPortfolioAllocationPercent, // Corrected property name usage
            targetPositionValueUsd: config_1.config.trading.targetPositionValueUsd, // Use config
            minPositionValueUsd: config_1.config.trading.minPositionValueUsd, // Use config
            maxPositions: config_1.config.risk.maxActivePositions // Corrected property name
        });
        logger_1.default.info('Portfolio Optimizer initialized.');
        // 3. Initialize Token Detection 
        logger_1.default.info('Initializing New Coin Detector...');
        // SWAP ARGUMENTS: Pass connection first, then config
        const newCoinDetector = new newCoinDetector_1.NewCoinDetector(connection, config_1.config);
        logger_1.default.info('New Coin Detector initialized.');
        // --- Event Wiring ---
        logger_1.default.info('Wiring up event listeners...');
        // 1. Detector finds a potential pattern -> Optimizer evaluates it
        newCoinDetector.on('patternDetected', async (patternDetection) => {
            logger_1.default.info(`<<< Pattern Detected: ${patternDetection.pattern} for ${patternDetection.tokenAddress} >>>`);
            notificationManager?.notifyPattern(patternDetection);
            try {
                const newPosition = await portfolioOptimizer.evaluatePattern(patternDetection);
                if (newPosition) {
                    logger_1.default.info(`PortfolioOptimizer opened position for ${newPosition.tokenSymbol}, ID: ${newPosition.id}. Adding to ExitManager.`);
                    exitManager.addPosition(newPosition); // Explicitly tell ExitManager to monitor
                    // Prepare payload for notification (matches Position interface)
                    const quantityDecimal = Number(newPosition.quantity) / Math.pow(10, newPosition.tokenDecimals);
                    const sizeUsd = quantityDecimal * newPosition.currentPrice;
                    const openNotificationPayload = {
                        id: newPosition.id,
                        tokenAddress: newPosition.tokenAddress,
                        tokenSymbol: newPosition.tokenSymbol,
                        tokenMint: newPosition.tokenMint, // From ManagedPosition
                        tokenDecimals: newPosition.tokenDecimals, // From ManagedPosition
                        quantity: quantityDecimal, // Calculated decimal quantity
                        entryPrice: newPosition.entryPrice,
                        currentPrice: newPosition.currentPrice,
                        size: sizeUsd, // Calculated USD size
                        stopLoss: newPosition.stopLoss ?? 0,
                        takeProfit: newPosition.takeProfit ?? 0,
                        pnl: 0, // Initial PNL is 0
                        status: 'open', // Set status
                        timestamp: newPosition.timestamp // Use position timestamp
                    };
                    notificationManager?.notifyTrade('open', openNotificationPayload);
                }
                else {
                    logger_1.default.info(`PortfolioOptimizer did not open a position for pattern ${patternDetection.pattern} on ${patternDetection.metrics.symbol}.`);
                }
            }
            catch (error) {
                logger_1.default.error(`Error evaluating pattern for ${patternDetection.tokenAddress}: ${error.message}`, { error });
                notificationManager?.notifyError(`Error evaluating pattern for ${patternDetection.tokenAddress}: ${error.message}`);
            }
        });
        // 3. Exit Manager closes a position -> Optimizer updates its state
        exitManager.on('exitSignal', (position, executionResult, reason) => {
            logger_1.default.info(`<<< ExitManager closed position: ${position.tokenSymbol}, Reason: ${reason}`);
            let pnlPercent = 0; // Default PNL
            if (executionResult && executionResult.success && executionResult.outputAmount !== undefined && executionResult.outputAmount !== null) {
                // Calculate PNL based on SOL amounts if initial cost is available
                if (position.initialSolCostLamports !== undefined) {
                    const solReceivedLamports = executionResult.outputAmount; // SOL received from selling token
                    const initialSolCostLamports = position.initialSolCostLamports;
                    const pnlLamports = solReceivedLamports - initialSolCostLamports;
                    // Use Number for division, potential precision loss is acceptable for percentage display
                    pnlPercent = initialSolCostLamports > 0n ? (Number(pnlLamports) / Number(initialSolCostLamports)) * 100 : 0;
                    logger_1.default.info(`Trade closed successfully. PNL: ${pnlLamports} lamports (${pnlPercent.toFixed(2)}%). Tx: ${executionResult.txSignature}`);
                }
                else {
                    logger_1.default.warn(`Cannot calculate SOL-based PNL for ${position.id}, initialSolCostLamports is missing. Reporting 0% PNL.`);
                    // Optionally calculate price-based PNL as fallback here if needed
                }
                const exitPrice = executionResult.actualExecutionPrice ?? position.currentPrice; // Use actual exit price if available
                // Calculate quantity and size based on actual decimals
                const quantityDecimal = Number(position.quantity) / Math.pow(10, position.tokenDecimals);
                const sizeUsd = quantityDecimal * exitPrice;
                const closeNotificationPayload = {
                    id: position.id,
                    tokenAddress: position.tokenAddress,
                    tokenSymbol: position.tokenSymbol,
                    tokenMint: position.tokenMint, // From ManagedPosition
                    tokenDecimals: position.tokenDecimals, // From ManagedPosition
                    quantity: quantityDecimal, // Calculated decimal quantity
                    entryPrice: position.entryPrice,
                    currentPrice: exitPrice, // Use exit price
                    size: sizeUsd, // Calculated USD size at exit
                    stopLoss: position.stopLoss ?? 0,
                    takeProfit: position.takeProfit ?? 0,
                    pnl: pnlPercent,
                    status: 'closed', // Set status
                    timestamp: executionResult.timestamp || Date.now() // Use execution timestamp or now
                };
                // Pass only type and position object to notifyTrade
                notificationManager?.notifyTrade('close', closeNotificationPayload);
                // Inform PortfolioOptimizer about the exit
                portfolioOptimizer.handlePositionExit(position.id, pnlPercent, reason);
            }
            else {
                logger_1.default.error(`Exit trade failed or execution result missing for ${position.tokenSymbol} (${position.id}). Reason: ${reason}`, { error: executionResult?.error });
                notificationManager?.notifyError(`Exit trade failed for ${position.tokenSymbol}: ${executionResult?.error || 'Unknown error'}`);
                // Inform PortfolioOptimizer about the failed exit
                portfolioOptimizer.handlePositionExit(position.id, undefined, `Exit Failed: ${reason} - ${executionResult?.error || 'Unknown error'}`);
            }
        });
        // --- Start Services ---
        logger_1.default.info('Starting services...');
        await notificationManager.notifyInfo('Bot starting up...');
        exitManager.start(); // Start ExitManager monitoring loops
        await newCoinDetector.start(); // Use start() instead of startScanning()
        logger_1.default.info('Trading bot is running.');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger_1.default.error('Unhandled error during bot initialization or runtime:', { message: errorMessage, originalError: error });
        try {
            // Attempt to notify about the critical failure if manager was initialized
            notificationManager?.notifyError(`CRITICAL BOT FAILURE: ${errorMessage}`);
        }
        catch (notificationError) {
            logger_1.default.error('Failed to send error notification:', notificationError);
        }
        process.exit(1); // Exit on critical failure
    } /* No finally block needed as process exits or continues */
    // We don't reach here if startDetection runs indefinitely or process exits
    logger_1.default.info('Bot initialization sequence complete. Running...');
}
;
main().catch(error => {
    logger_1.default.error('Error in main:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map