"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const newCoinDetector_1 = require("./services/newCoinDetector");
const notificationManager_1 = require("./live/notificationManager");
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const birdeyeAPI_1 = require("./api/birdeyeAPI");
const orderExecution_1 = require("./orderExecution");
const riskManager_1 = require("./live/riskManager");
const exitManager_1 = require("./strategy/exitManager");
const portfolioOptimizer_1 = require("./strategy/portfolioOptimizer");
const logger_1 = __importDefault(require("./utils/logger"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// --- Environment Variable Validation ---
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
if (!SOLANA_RPC_URL || !SOLANA_PRIVATE_KEY || !BIRDEYE_API_KEY) {
    logger_1.default.error('Missing required environment variables: SOLANA_RPC_URL, SOLANA_PRIVATE_KEY, BIRDEYE_API_KEY');
    process.exit(1);
}
let wallet;
try {
    wallet = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(SOLANA_PRIVATE_KEY));
    logger_1.default.info(`Wallet loaded: ${wallet.publicKey.toBase58()}`);
}
catch (error) {
    logger_1.default.error('Failed to decode SOLANA_PRIVATE_KEY. Ensure it is a base58 encoded secret key.', error);
    process.exit(1);
}
// --- Main Application Setup ---
async function main() {
    // Re-check critical keys just before use to satisfy TypeScript
    if (!SOLANA_PRIVATE_KEY) {
        throw new Error('SOLANA_PRIVATE_KEY is unexpectedly undefined');
    }
    // Declare NotificationManager outside try block to use in catch
    let notificationManager = null;
    try {
        // Initialize notification manager
        notificationManager = new notificationManager_1.NotificationManager({
            discord: process.env.DISCORD_WEBHOOK ? {
                webhookUrl: process.env.DISCORD_WEBHOOK
            } : undefined,
            telegram: process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_SESSION && process.env.TELEGRAM_CHAT_ID ? {
                apiId: parseInt(process.env.TELEGRAM_API_ID),
                apiHash: process.env.TELEGRAM_API_HASH || '', // Add default
                sessionString: process.env.TELEGRAM_SESSION || '', // Add default
                chatId: process.env.TELEGRAM_CHAT_ID || '' // Add default
            } : undefined,
            notifyLevel: process.env.NOTIFY_LEVEL || 'all' // Cast to any to allow string values
        });
        // 1. Initialize Core Services
        logger_1.default.info(`Initializing core services...`);
        logger_1.default.info(`Using wallet: ${wallet.publicKey.toBase58()}`);
        logger_1.default.info(`Connecting to Solana RPC: ${SOLANA_RPC_URL}`);
        const connection = new web3_js_1.Connection(SOLANA_RPC_URL, 'confirmed');
        const birdeyeApi = new birdeyeAPI_1.BirdeyeAPI(BIRDEYE_API_KEY); // Use non-null assertion
        const orderExecution = new orderExecution_1.LiveOrderExecution(connection, wallet, {
            slippageBps: parseInt(process.env.JUPITER_SLIPPAGE_BPS || '100') // Default 1%
        });
        // Provide RiskManager configuration from env vars or defaults
        const riskManager = new riskManager_1.RiskManager({
            maxDrawdown: parseFloat(process.env.RISK_MAX_DRAWDOWN || '20'), // 20% default
            maxDailyLoss: parseFloat(process.env.RISK_MAX_DAILY_LOSS || '10'), // 10% default
            maxPositions: parseInt(process.env.MAX_POSITIONS || '5'),
            maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE_SOL || '1'), // Max 1 SOL per position default
            // Optional config can be added here from env vars
            maxPositionValueUsd: parseFloat(process.env.TARGET_POSITION_VALUE_USD || '50'),
            maxLiquidityPercent: parseFloat(process.env.MAX_LIQUIDITY_PERCENTAGE || '0.05'), // 5% default
            minPositionValueUsd: parseFloat(process.env.MIN_POSITION_VALUE_USD || '10')
        });
        // TODO: Define ExitManager config - potentially load from a file or env vars
        const exitManagerConfig = {
            // Example overrides
            lossExits: { stopLoss: -15 }, // 15% stop loss default
            trailingStops: { enabled: true, activationThreshold: 20, trailPercent: 10 },
        };
        const exitManager = new exitManager_1.ExitManager(orderExecution, riskManager, birdeyeApi, exitManagerConfig);
        // 2. Initialize Portfolio Optimizer
        const portfolioOptimizer = new portfolioOptimizer_1.PortfolioOptimizer({
            orderExecution: orderExecution,
            riskManager: riskManager,
            birdeyeApi: birdeyeApi,
            exitManager: exitManager, // PortfolioOptimizer needs ExitManager ref
            maxPortfolioAllocationPercent: parseFloat(process.env.MAX_PORTFOLIO_ALLOCATION || '50'), // 50% of capital
            targetPositionValueUsd: parseFloat(process.env.TARGET_POSITION_VALUE_USD || '50'), // Target $50 per position
            minPositionValueUsd: parseFloat(process.env.MIN_POSITION_VALUE_USD || '10'), // Min $10 per position
            maxPositions: parseInt(process.env.MAX_POSITIONS || '5') // Max 5 positions
        });
        // 3. Initialize Token Detection (Replace Demo Detector)
        // Example: Using Birdeye WebSocket Integration (assuming class exists)
        // const tokenDetector = new BirdeyeTokenDetector(BIRDEYE_API_KEY, { /* config */ });
        // For now, keep the demo detector to avoid breaking execution, but mark as TODO
        logger_1.default.info('Initializing Real New Coin Detector...');
        const detectorConfig = {
            minLiquidity: parseFloat(process.env.MIN_LIQUIDITY || '5000'), // Default $5000
            maxAgeHours: parseFloat(process.env.MAX_TOKEN_AGE_HOURS || '24'), // Default 24 hours
            scanIntervalSec: parseInt(process.env.DETECTOR_SCAN_INTERVAL_SEC || '60'), // Default 60 seconds
            birdeyeApiKey: BIRDEYE_API_KEY, // Required - Use non-null assertion
            defaultStopLossPercent: parseFloat(process.env.DEFAULT_STOP_LOSS_PERCENT || '10'), // Default 10%
            defaultTimeframe: process.env.DEFAULT_TIMEFRAME || '15m', // Default 15 minutes
        };
        const newCoinDetector = new newCoinDetector_1.NewCoinDetector(detectorConfig);
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
