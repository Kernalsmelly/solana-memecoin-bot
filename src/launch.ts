import * as dotenv from 'dotenv';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import logger from './utils/logger';
import { LiveOrderExecution, OrderExecutionConfig } from './orderExecution';
import { RiskManager, CircuitBreakerReason } from './live/riskManager';
import { BirdeyeAPI } from './api/birdeyeAPI';
import { TokenDiscovery, TokenDiscoveryOptions } from './discovery/tokenDiscovery';
import { PatternDetector, PatternDetectorConfig } from './strategy/patternDetector';
import verifyConfig from './utils/verifyConfig';
import { sendAlert } from './utils/notifications';
import { manageFunds } from './utils/fundManager';
import { RiskMetrics } from './types';

dotenv.config();

// Constants for production operation
const PRODUCTION_MODE = process.env.NODE_ENV === 'production';
const DRY_RUN_MODE = process.argv.includes('--dry-run');
const INITIAL_CAPITAL_PERCENT = Number(process.env.INITIAL_CAPITAL_PERCENT || '10');
const MIN_LIQUIDITY = Number(process.env.MIN_LIQUIDITY || '50000');
const MIN_TRANSACTIONS_5MIN = Number(process.env.MIN_TRANSACTIONS_5MIN || '5');

// State Persistence Configuration
const DATA_DIRECTORY = process.env.DATA_DIRECTORY || './data';
const STATE_FILE_PATH = path.join(DATA_DIRECTORY, 'bot_state.json');
const SAVE_INTERVAL_MS = Number(process.env.SAVE_INTERVAL_MINUTES || 5) * 60 * 1000; // Save every 5 mins by default

// --- Helper Functions for State Persistence ---

function loadSystemState(): Partial<RiskMetrics> | null {
    if (fs.existsSync(STATE_FILE_PATH)) {
        try {
            const stateJson = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
            const state = JSON.parse(stateJson);
            logger.info(`Loaded system state from ${STATE_FILE_PATH}`, { stateKeys: Object.keys(state).join(', ') });
            // Basic validation (ensure it's an object)
            if (typeof state === 'object' && state !== null) {
                return state as Partial<RiskMetrics>;
            } else {
                logger.warn(`Invalid state file format found at ${STATE_FILE_PATH}. Starting fresh.`);
                return null;
            }
        } catch (error: any) {
            logger.error(`Failed to load or parse state file ${STATE_FILE_PATH}: ${error?.message}`);
            return null; // Start fresh if loading fails
        }
    }
    logger.info(`No state file found at ${STATE_FILE_PATH}. Starting fresh.`);
    return null;
}

function saveSystemState(riskManager: RiskManager | null) {
    if (!riskManager) {
        logger.warn('RiskManager not initialized, cannot save state.');
        return;
    }
    try {
        const stateToSave = riskManager.getMetrics();

        // Ensure data directory exists
        if (!fs.existsSync(DATA_DIRECTORY)) {
            fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
            logger.info(`Created data directory: ${DATA_DIRECTORY}`);
        }

        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(stateToSave, null, 2));
        logger.debug(`System state saved to ${STATE_FILE_PATH}`);

    } catch (error: any) {
        logger.error(`Failed to save system state to ${STATE_FILE_PATH}: ${error?.message}`);
    }
}

/**
 * SolMemeBot Production Launch Script
 * Handles safe initialization and operation of the trading system
 */
async function launchTradingSystem() {
    let riskManager: RiskManager | null = null; // Keep riskManager accessible for shutdown handler
    let saveIntervalId: NodeJS.Timeout | null = null; // Keep interval ID accessible

    logger.info('Starting SolMemeBot Trading System', { 
        production: PRODUCTION_MODE,
        dryRun: DRY_RUN_MODE,
        timestamp: new Date().toISOString()
    });

    try {
        // 1. Verify configuration
        logger.info('Verifying system configuration...');
        const configResult = await verifyConfig();
        
        if (!configResult.isValid) {
            logger.error('Configuration verification failed', configResult);
            await sendAlert('Failed to start trading system: Invalid configuration', 'CRITICAL');
            process.exit(1);
        }
        
        logger.info('Configuration validated successfully');
        
        // 2. Setup core components
        const privateKeyStr = process.env.WALLET_PRIVATE_KEY;
        if (!privateKeyStr) {
            logger.error('FATAL: WALLET_PRIVATE_KEY is not set in the environment variables.');
            await sendAlert('FATAL: WALLET_PRIVATE_KEY is not set!', 'CRITICAL');
            process.exit(1);
        }
        const privateKey = bs58.decode(privateKeyStr);
        const wallet = Keypair.fromSecretKey(privateKey);
        const rpcEndpoint = process.env.SOLANA_RPC_URL;
        if (!rpcEndpoint) {
            logger.error('FATAL: SOLANA_RPC_URL is not set in the environment variables.');
            await sendAlert('FATAL: SOLANA_RPC_URL is not set!', 'CRITICAL');
            process.exit(1);
        }
        const connection = new Connection(rpcEndpoint, 'confirmed');
        
        // 3. Check wallet balances
        logger.info('Checking wallet balances...');
        const walletReport = await manageFunds({ action: 'check', saveReport: true, connection, wallet });
        
        if (walletReport.usdcBalance < 10 && PRODUCTION_MODE && !DRY_RUN_MODE) {
            logger.error('USDC balance is too low for production trading', { usdcBalance: walletReport.usdcBalance });
            await sendAlert(`Insufficient USDC balance for trading: $${walletReport.usdcBalance}`, 'CRITICAL');
            logger.error('Aborting production launch due to insufficient funds');
            process.exit(1);
        } else if (walletReport.usdcBalance < 10) {
             logger.warn('USDC balance is very low', { usdcBalance: walletReport.usdcBalance });
             await sendAlert(`Low USDC balance: $${walletReport.usdcBalance}`, 'WARNING');
        }

        if (walletReport.solBalance < 0.01 && PRODUCTION_MODE && !DRY_RUN_MODE) { // Ensure enough SOL for fees
            logger.error('SOL balance is too low for transaction fees', { solBalance: walletReport.solBalance });
            await sendAlert(`Insufficient SOL balance for fees: ${walletReport.solBalance} SOL`, 'CRITICAL');
            logger.error('Aborting production launch due to insufficient SOL');
            process.exit(1);
        } else if (walletReport.solBalance < 0.05) {
             logger.warn('SOL balance is low, may run out paying fees', { solBalance: walletReport.solBalance });
             await sendAlert(`Low SOL balance: ${walletReport.solBalance} SOL`, 'WARNING');
        }
        
        // --- Load State BEFORE Initializing Risk Manager ---
        const loadedState = loadSystemState();

        // 4. Initialize Risk Manager
        logger.info('Initializing risk management system...');
        riskManager = new RiskManager({
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
            logger.warn('Circuit breaker triggered', { reason, message, timestamp });
            await sendAlert(`Circuit breaker triggered: ${reason} - ${message}`, 'WARNING');
            saveSystemState(riskManager); // Save state when breaker triggers
        });
        
        // Setup emergency stop event handler
        riskManager.on('emergencyStop', async (data) => {
            const { reason, message, timestamp } = data;
            logger.error('EMERGENCY STOP ACTIVATED', { reason, message, timestamp });
            await sendAlert(`🚨 EMERGENCY STOP ACTIVATED: ${reason} - ${message}`, 'CRITICAL');
            saveSystemState(riskManager); // Save state on emergency stop
            // The existing emergency state save is still useful for specific details
            const stateDir = './emergency-states';
            if (!fs.existsSync(stateDir)) {
                fs.mkdirSync(stateDir, { recursive: true });
            }
            fs.writeFileSync(
                `${stateDir}/emergency-state-${Date.now()}.json`, 
                JSON.stringify({ ...data, metrics: riskManager?.getMetrics() }, null, 2)
            );
            if (PRODUCTION_MODE) {
                logger.info('Initiating graceful shutdown due to emergency stop...');
                setTimeout(() => process.exit(1), 5000);
            }
        });
        
        // 5. Initialize Order Execution
        logger.info('Initializing order execution system...');
        const slippageBps = Number(process.env.SLIPPAGE_BPS || 100); // Use SLIPPAGE_BPS from .env
        const orderExecutionConfig: OrderExecutionConfig = { slippageBps };
        const orderExecution = new LiveOrderExecution(connection, wallet, orderExecutionConfig);
        // No initialize needed for the new class structure
        
        // 6. Initialize Token Discovery
        logger.info('Initializing token discovery system...');
        const birdeyeApiKey = process.env.BIRDEYE_API_KEY;
        if (!birdeyeApiKey && PRODUCTION_MODE) {
            logger.error('Missing Birdeye API key in production mode');
            process.exit(1);
        }
        const birdeyeAPI = new BirdeyeAPI(birdeyeApiKey || 'demo-key'); // Use demo key if not prod/set
        
        // Instantiate TokenDiscovery with correct arguments
        const discoveryOptions: TokenDiscoveryOptions = {
            minLiquidity: MIN_LIQUIDITY,
            // minVolume: ..., // Add if needed from env/config
            maxTokenAge: Number(process.env.MAX_TOKEN_AGE || 24) * 60 * 60 * 1000, // Convert hours to ms
            // cleanupIntervalMs: ..., // Add if needed from env/config
            // analysisThrottleMs: ..., // Add if needed from env/config
        };
        const tokenDiscovery = new TokenDiscovery(
            birdeyeAPI, // 1st arg: BirdeyeAPI instance
            discoveryOptions, // 2nd arg: Options object
            riskManager // 3rd arg: RiskManager instance (optional)
        );
        
        // 7. Initialize Pattern Detector
        logger.info('Initializing pattern detection system...');
        // Instantiate PatternDetector with correct config object
        const detectorConfig: PatternDetectorConfig = {
            tokenDiscovery, // Required
            riskManager, // Required
            // Add optional config from env if needed:
            // maxTokenAge: ..., 
            // minLiquidity: ..., 
            // maxPositionValue: ..., 
            // enabledPatterns: ...
        };
        const patternDetector = new PatternDetector(detectorConfig);

        // --- Setup State Persistence & Shutdown Hooks ---
        logger.info(`Setting up periodic state save every ${SAVE_INTERVAL_MS / 60000} minutes.`);
        saveSystemState(riskManager); // Initial save after setup
        saveIntervalId = setInterval(() => {
            saveSystemState(riskManager);
        }, SAVE_INTERVAL_MS);

        const shutdown = async (signal: string) => {
            logger.info(`Received ${signal}. Graceful shutdown initiated...`);
            if (saveIntervalId) clearInterval(saveIntervalId); // Stop periodic saves
            
            // Add any other cleanup needed (e.g., close WebSocket connections)
            logger.info('Closing Birdeye WebSocket...');
            // Correct method call: disconnect() instead of close()
            birdeyeAPI.disconnect(); 

            logger.info('Saving final system state...');
            saveSystemState(riskManager); // Perform final save

            logger.info('Shutdown complete. Exiting.');
            // Allow time for logs to flush
            setTimeout(() => process.exit(0), 2000);
        };

        process.on('SIGINT', () => shutdown('SIGINT')); // Catch Ctrl+C
        process.on('SIGTERM', () => shutdown('SIGTERM')); // Catch kill commands
        process.on('uncaughtException', async (error) => {
            logger.error('CRITICAL: Uncaught Exception:', error);
            // NOTE: This error might be spurious, as the error could be from the shutdown process itself.
            await sendAlert(`CRITICAL: Uncaught Exception - ${error.message}`, 'CRITICAL');
            // Attempt to save state before crashing
            logger.info('Attempting emergency state save before exiting due to uncaught exception...');
            saveSystemState(riskManager);
            setTimeout(() => process.exit(1), 3000); // Exit after attempting save
        });
        process.on('unhandledRejection', async (reason, promise) => {
             logger.error(`CRITICAL: Unhandled Rejection at: ${promise}`, reason);
             // Attempt to save state before crashing
             logger.info('Attempting emergency state save before exiting due to unhandled rejection...');
             saveSystemState(riskManager);
             setTimeout(() => process.exit(1), 3000); // Exit after attempting save
        });

        // 8. Start Systems (Dry Run or Production)
        if (DRY_RUN_MODE) {
            logger.info('Starting in DRY RUN mode - no trades will be executed');
            // ... (existing dry run logic, ensuring it doesn't call real orderExecution)
            // Make sure patternDetector doesn't execute real trades in dry run
            await tokenDiscovery.start();
            await patternDetector.start(); // Remove boolean argument
            
            await sendAlert('Trading system started in DRY RUN mode', 'INFO');
            logger.info('Dry run mode active. Monitoring events...');
            // Dry run might run indefinitely or have a duration based on env var

        } else if (PRODUCTION_MODE) {
            logger.info('Starting in PRODUCTION mode');
            // ... (existing production logic)
            await tokenDiscovery.start();
            await patternDetector.start(); // Remove boolean argument

            await sendAlert('Trading system started in PRODUCTION mode', 'INFO');
            logger.info('Production mode active. Monitoring for trading opportunities...');

        } else {
            logger.warn('Not in PRODUCTION or DRY_RUN mode. Starting discovery/detection but NO TRADING.');
            // Start services but maybe don't connect patternDetector to orderExecution fully?
            await tokenDiscovery.start();
            await patternDetector.start(); // Remove boolean argument
            await sendAlert('Trading system started in Development/Test mode', 'INFO');
        }

    } catch (error: any) {
        logger.error('Fatal error during system launch:', error);
        await sendAlert(`FATAL LAUNCH ERROR: ${error.message}`, 'CRITICAL');
        // Attempt final save even on launch error
        logger.info('Attempting state save after launch failure...');
        saveSystemState(riskManager); 
        process.exit(1);
    }
}

// Run when invoked directly
if (require.main === module) {
    launchTradingSystem().catch(error => {
        logger.error('Unhandled promise rejection during launch:', error);
        // Attempt final save
        // saveSystemState(riskManager); // riskManager might not be in scope here
        process.exit(1);
    });
}
