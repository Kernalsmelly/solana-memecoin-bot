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
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("./utils/logger"));
const orderExecution_1 = require("./orderExecution");
const riskManager_1 = require("./live/riskManager");
const verifyConfig_1 = __importDefault(require("./utils/verifyConfig"));
const notifications_1 = require("./utils/notifications");
const config_1 = require("./utils/config");
const newCoinDetector_1 = require("./services/newCoinDetector");
const priceWatcher_1 = require("./services/priceWatcher");
const tradingEngine_1 = require("./services/tradingEngine");
// src/launch.ts
console.log('=== LAUNCH SCRIPT STARTED ===');
dotenv.config();
// Constants for production operation
const PRODUCTION_MODE = process.env.NODE_ENV === 'production';
const DRY_RUN_MODE = process.argv.includes('--dry-run');
const INITIAL_CAPITAL_PERCENT = Number(process.env.INITIAL_CAPITAL_PERCENT || '10');
const MIN_LIQUIDITY = Number(process.env.MIN_LIQUIDITY || '50000');
const MIN_TRANSACTIONS_5MIN = Number(process.env.MIN_TRANSACTIONS_5MIN || '5');
// State Persistence Configuration
const SAVE_INTERVAL_MS = Number(process.env.SAVE_INTERVAL_MINUTES || 5) * 60 * 1000; // Save every 5 mins by default
// --- Helper Functions for State Persistence ---
function loadSystemState(stateFilePath) {
    if (fs.existsSync(stateFilePath)) {
        try {
            const stateJson = fs.readFileSync(stateFilePath, 'utf-8');
            const state = JSON.parse(stateJson);
            logger_1.default.info(`Loaded system state from ${stateFilePath}`, { stateKeys: Object.keys(state).join(', ') });
            // Basic validation (ensure it's an object)
            if (typeof state === 'object' && state !== null) {
                return state;
            }
            else {
                logger_1.default.warn(`Invalid state file format found at ${stateFilePath}. Starting fresh.`);
                return null;
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to load or parse state file ${stateFilePath}: ${error?.message}`);
            return null; // Start fresh if loading fails
        }
    }
    logger_1.default.info(`No state file found at ${stateFilePath}. Starting fresh.`);
    return null;
}
function saveSystemState(riskManager, stateFilePath) {
    if (!riskManager) {
        logger_1.default.warn('RiskManager not initialized, cannot save state.');
        return;
    }
    try {
        const stateToSave = riskManager.getMetrics();
        logger_1.default.debug(`Attempting to write state to: ${stateFilePath}`); // Log path before writing
        fs.writeFileSync(stateFilePath, JSON.stringify(stateToSave, null, 2));
        logger_1.default.debug(`System state saved to ${stateFilePath}`);
    }
    catch (error) {
        logger_1.default.error(`Failed to save system state to ${stateFilePath}: ${error?.message}`);
    }
}
/**
 * SolMemeBot Production Launch Script
 * Handles safe initialization and operation of the trading system
 */
async function launchTradingSystem() {
    let riskManager = null; // Keep riskManager accessible for shutdown handler
    let saveIntervalId = null; // Keep interval ID accessible
    let newCoinDetector = null; // Keep detector accessible
    let priceWatcher = null; // Keep watcher accessible
    let tradingEngine;
    logger_1.default.info('Starting SolMemeBot Trading System', {
        production: PRODUCTION_MODE,
        dryRun: DRY_RUN_MODE,
        timestamp: new Date().toISOString()
    });
    try {
        // 1. Verify configuration
        logger_1.default.info('Verifying system configuration...');
        const configResult = await (0, verifyConfig_1.default)();
        if (!configResult.isValid) {
            logger_1.default.error('Configuration verification failed', configResult);
            await (0, notifications_1.sendAlert)('Failed to start trading system: Invalid configuration', 'CRITICAL');
            process.exit(1);
        }
        logger_1.default.info('Configuration validated successfully');
        // Define and ensure data directory exists
        // Use absolute path to avoid potential relative path issues
        const dataDir = path.resolve(config_1.config.trading.dataDirectory);
        const stateFilePath = path.join(dataDir, 'bot_state.json');
        logger_1.default.info(`Checking data directory path: ${dataDir}`); // Log the path
        // Force creation attempt - mkdirSync with recursive:true is safe if dir exists
        try {
            fs.mkdirSync(dataDir, { recursive: true });
            logger_1.default.info(`Ensured data directory exists: ${dataDir}`); // Log success/existence
        }
        catch (mkdirError) {
            logger_1.default.error(`Failed to ensure data directory ${dataDir} exists: ${mkdirError?.message}`);
            // This is likely fatal if we can't create/access the data directory
            process.exit(1);
        }
        // 2. Setup core components
        const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
        if (!privateKeyStr) {
            logger_1.default.error('FATAL: SOLANA_PRIVATE_KEY is not set in the environment variables.');
            await (0, notifications_1.sendAlert)('FATAL: SOLANA_PRIVATE_KEY is not set!', 'CRITICAL');
            process.exit(1);
        }
        const privateKey = bs58_1.default.decode(privateKeyStr);
        const wallet = web3_js_1.Keypair.fromSecretKey(privateKey);
        const rpcEndpoint = config_1.config.solana.rpcEndpoint;
        if (!rpcEndpoint || typeof rpcEndpoint !== 'string') {
            logger_1.default.error(`FATAL: Invalid Solana RPC endpoint configured: ${rpcEndpoint}`);
            process.exit(1);
        }
        logger_1.default.info(`Connecting with RPC: ${rpcEndpoint}`); // Log endpoint being used
        const connection = new web3_js_1.Connection(rpcEndpoint, 'confirmed');
        // 2.5 Initialize PriceWatcher
        logger_1.default.info('Initializing price watcher system...');
        priceWatcher = new priceWatcher_1.PriceWatcher(connection, config_1.config); // Instantiate PriceWatcher
        // 2.6 Initialize TradingEngine
        if (!wallet) { // Ensure wallet is loaded before passing
            throw new Error('Wallet Keypair not loaded, cannot initialize TradingEngine.');
        }
        tradingEngine = new tradingEngine_1.TradingEngine(connection, config_1.config, wallet);
        // 3. Check wallet balances
        logger_1.default.info('Checking wallet balances...');
        // const walletReport = await manageFunds({ action: 'check', saveReport: true, connection, wallet });
        // Temporarily commented out
        // if (walletReport.usdcBalance < 10 && PRODUCTION_MODE && !DRY_RUN_MODE) {
        //     logger.error('USDC balance is too low for production trading', { usdcBalance: walletReport.usdcBalance });
        //     await sendAlert(`Insufficient USDC balance for trading: $${walletReport.usdcBalance}`, 'CRITICAL');
        //     logger.error('Aborting production launch due to insufficient funds');
        //     process.exit(1);
        // } else if (walletReport.usdcBalance < 10) {
        //      logger.warn('USDC balance is very low', { usdcBalance: walletReport.usdcBalance });
        //      await sendAlert(`Low USDC balance: $${walletReport.usdcBalance}`, 'WARNING');
        // }
        // if (walletReport.solBalance < 0.01 && PRODUCTION_MODE && !DRY_RUN_MODE) { // Ensure enough SOL for fees
        //     logger.error('SOL balance is too low for transaction fees', { solBalance: walletReport.solBalance });
        //     await sendAlert(`Insufficient SOL balance for fees: ${walletReport.solBalance} SOL`, 'CRITICAL');
        //     logger.error('Aborting production launch due to insufficient SOL');
        //     process.exit(1);
        // } else if (walletReport.solBalance < 0.05) {
        //      logger.warn('SOL balance is low, may run out paying fees', { solBalance: walletReport.solBalance });
        //      await sendAlert(`Low SOL balance: ${walletReport.solBalance} SOL`, 'WARNING');
        // }
        // --- Load State BEFORE Initializing Risk Manager ---
        const loadedState = loadSystemState(stateFilePath);
        // 4. Initialize Risk Manager
        logger_1.default.info('Initializing risk management system...');
        riskManager = new riskManager_1.RiskManager({
            maxPositionSize: Number(process.env.MAX_POSITION_SIZE || 50),
            maxPositions: Number(process.env.MAX_ACTIVE_POSITIONS || 3),
            maxDailyLoss: Number(process.env.MAX_DAILY_LOSS_PERCENT || 5),
            maxDrawdown: Number(process.env.MAX_DRAWDOWN_PERCENT || 10),
            // Add other RiskManagerConfig properties from .env if needed
            // maxVolatility: ... , maxPriceDeviation: ... etc.
        }, loadedState); // <-- Pass loaded state here
        // Setup circuit breaker event handler
        riskManager.on('circuitBreaker', async (data) => {
            const { reason, message, timestamp } = data;
            logger_1.default.warn('Circuit breaker triggered', { reason, message, timestamp });
            await (0, notifications_1.sendAlert)(`Circuit breaker triggered: ${reason} - ${message ?? 'No details'}`, 'WARNING'); // Added nullish coalescing for message
            saveSystemState(riskManager, stateFilePath); // Save state when breaker triggers
        });
        // Setup emergency stop event handler
        riskManager.on('emergencyStop', async (data) => {
            const { reason, message, timestamp } = data;
            logger_1.default.error('EMERGENCY STOP ACTIVATED', { reason, message, timestamp });
            await (0, notifications_1.sendAlert)(`🚨 EMERGENCY STOP ACTIVATED: ${reason} - ${message ?? 'No details'}`, 'CRITICAL'); // Added nullish coalescing for message
            saveSystemState(riskManager, stateFilePath); // Save state on emergency stop
            // The existing emergency state save is still useful for specific details
            const stateDir = './emergency-states';
            if (!fs.existsSync(stateDir)) {
                fs.mkdirSync(stateDir, { recursive: true });
            }
            fs.writeFileSync(`${stateDir}/emergency-state-${Date.now()}.json`, JSON.stringify({ ...data, metrics: riskManager?.getMetrics() }, null, 2));
            if (PRODUCTION_MODE) {
                logger_1.default.info('Initiating graceful shutdown due to emergency stop...');
                setTimeout(() => process.exit(1), 5000);
            }
        });
        // 5. Initialize Order Execution
        logger_1.default.info('Initializing order execution system...');
        const orderExecutionConfig = { slippageBps: config_1.config.trading.jupiterSlippageBps };
        const orderExecution = new orderExecution_1.LiveOrderExecution(connection, wallet, orderExecutionConfig);
        // No initialize needed for the new class structure
        // 7. Initialize New Coin Detector
        logger_1.default.info('Initializing new coin detection system...');
        // Revert diagnostic assertion - type should now be correctly inferred
        newCoinDetector = new newCoinDetector_1.NewCoinDetector(connection, config_1.config);
        // --- Setup New Pool Detected Event Listener --- 
        newCoinDetector.on('newPoolDetected', (eventData) => {
            logger_1.default.info(`[Launch] Detected new pool via event: Base Mint ${eventData.baseMint}, Pool ${eventData.poolAddress}, Quote ${eventData.quoteMint}`);
            // Start watching this token with the PriceWatcher
            // Pass both the token mint (baseMint) and the pool address
            if (priceWatcher) {
                priceWatcher.watchToken(eventData.baseMint, eventData.poolAddress);
            }
            else {
                logger_1.default.error('[Launch] PriceWatcher not initialized when newPoolDetected event was received. Cannot watch token.');
            }
            // TODO: Potentially trigger initial evaluation by TradingEngine immediately?
            // tradingEngine.evaluateToken(tokenMint);
        });
        // --- Connect PriceWatcher to Trading Engine --- 
        if (priceWatcher && tradingEngine) {
            logger_1.default.info('[Launch] Connecting PriceWatcher marketDataUpdate events to TradingEngine...');
            priceWatcher.on('marketDataUpdate', (marketData) => {
                tradingEngine?.evaluateToken(marketData); // Use optional chaining just in case
            });
        }
        else {
            logger_1.default.error('[Launch] Failed to connect PriceWatcher and TradingEngine. One or both are not initialized.');
        }
        // --- Setup State Persistence & Shutdown Hooks ---
        logger_1.default.info(`Setting up periodic state save every ${SAVE_INTERVAL_MS / 60000} minutes.`);
        saveSystemState(riskManager, stateFilePath); // Initial save after setup
        saveIntervalId = setInterval(() => {
            saveSystemState(riskManager, stateFilePath);
        }, SAVE_INTERVAL_MS);
        const shutdown = async (signal) => {
            logger_1.default.info(`Received ${signal}. Graceful shutdown initiated...`);
            if (saveIntervalId)
                clearInterval(saveIntervalId); // Stop periodic saves
            // Add any other cleanup needed (e.g., close WebSocket connections)
            logger_1.default.info('Closing Helius WebSocket...');
            // TODO: Check if HeliusAPI class has a disconnect/cleanup method and call it.
            // if (heliusApi && typeof heliusApi.disconnect === 'function') heliusApi.disconnect();
            if (newCoinDetector)
                newCoinDetector.stop(); // Call the detector's stop method for cleanup
            if (priceWatcher)
                priceWatcher.stop(); // Stop the price watcher
            logger_1.default.info('Saving final system state...');
            saveSystemState(riskManager, stateFilePath); // Perform final save
            logger_1.default.info('Shutdown complete. Exiting.');
            // Allow time for logs to flush
            setTimeout(() => process.exit(0), 2000);
        };
        process.on('SIGINT', () => shutdown('SIGINT')); // Catch Ctrl+C
        process.on('SIGTERM', () => shutdown('SIGTERM')); // Catch kill commands
        process.on('uncaughtException', async (error) => {
            logger_1.default.error('CRITICAL: Uncaught Exception:', error);
            // NOTE: This error might be spurious, as the error could be from the shutdown process itself.
            await (0, notifications_1.sendAlert)(`CRITICAL: Uncaught Exception - ${error.message}`, 'CRITICAL');
            // Attempt to save state before crashing
            logger_1.default.info('Attempting emergency state save before exiting due to uncaught exception...');
            // Cannot save here, riskManager/stateFilePath likely out of scope
            setTimeout(() => process.exit(1), 3000); // Exit after attempting save
        });
        process.on('unhandledRejection', async (reason, promise) => {
            logger_1.default.error(`CRITICAL: Unhandled Rejection at: ${promise}`, reason);
            // Attempt to save state before crashing
            logger_1.default.info('Attempting emergency state save before exiting due to unhandled rejection...');
            // Cannot save here, riskManager/stateFilePath likely out of scope
            setTimeout(() => process.exit(1), 3000); // Exit after attempting save
        });
        // 8. Start Systems (Dry Run or Production)
        if (DRY_RUN_MODE) {
            logger_1.default.info('Starting in DRY RUN mode - no trades will be executed');
            // Start the new coin detector
            if (newCoinDetector)
                newCoinDetector.start();
            if (priceWatcher) {
                logger_1.default.info('Starting Price Watcher...');
                priceWatcher.start(); // Start PriceWatcher polling
            }
            await (0, notifications_1.sendAlert)('Trading system started in DRY RUN mode', 'INFO');
            logger_1.default.info('Dry run mode active. Monitoring events...');
            // Dry run might run indefinitely or have a duration based on env var
        }
        else if (PRODUCTION_MODE) {
            logger_1.default.info('Starting in PRODUCTION mode');
            // ... (existing production logic)
            // Ensure RiskManager and OrderExecution are properly connected/used by downstream components
            if (newCoinDetector)
                newCoinDetector.start();
            if (priceWatcher) {
                logger_1.default.info('Starting Price Watcher...');
                priceWatcher.start(); // Start PriceWatcher polling
            }
            await (0, notifications_1.sendAlert)('Trading system started in PRODUCTION mode', 'INFO');
            logger_1.default.info('Production mode active. Monitoring for trading opportunities...');
        }
        else {
            logger_1.default.warn('Not in PRODUCTION or DRY_RUN mode. Starting discovery/detection but NO TRADING.');
            // Start services but maybe don't connect patternDetector to orderExecution fully?
            if (newCoinDetector)
                newCoinDetector.start();
            if (priceWatcher) {
                logger_1.default.info('Starting Price Watcher...');
                priceWatcher.start(); // Start PriceWatcher polling
            }
            await (0, notifications_1.sendAlert)('Trading system started in Development/Test mode', 'INFO');
        }
    }
    catch (error) {
        logger_1.default.error('Fatal error during system launch:', error);
        await (0, notifications_1.sendAlert)(`FATAL LAUNCH ERROR: ${error.message}`, 'CRITICAL');
        // Attempt final save even on launch error
        logger_1.default.info('Attempting state save after launch failure...');
        // Cannot save here, riskManager/stateFilePath likely out of scope
        process.exit(1);
    }
}
// Run when invoked directly
if (require.main === module) {
    launchTradingSystem().catch(error => {
        logger_1.default.error('Unhandled promise rejection during launch:', error);
        // Attempt final save
        // Cannot save here, riskManager/stateFilePath likely out of scope
        process.exit(1);
    });
}
//# sourceMappingURL=launch.js.map