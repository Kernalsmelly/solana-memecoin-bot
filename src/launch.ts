import * as dotenv from 'dotenv';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import logger from './utils/logger';
import { LiveOrderExecution, OrderExecutionConfig } from './orderExecution';
import { RiskManager, CircuitBreakerReason } from './live/riskManager';
import verifyConfig from './utils/verifyConfig';
import { sendAlert } from './utils/notifications';
import { config, Config } from './utils/config';
import { RiskMetrics } from './types';
import { NewCoinDetector, NewPoolDetectedEvent } from './services/newCoinDetector';
import { PriceWatcher } from './services/priceWatcher';
import { TradingEngine } from './services/tradingEngine';

// Global rate limiter to prevent excessive RPC calls
class RpcRateLimiter {
    private static instance: RpcRateLimiter;
    private rpcCallCount: number = 0;
    private rpcCallResetTime: number = Date.now();
    private readonly MAX_RPC_CALLS_PER_MINUTE: number = 60; // Adjust as needed
    
    private constructor() {
        // Private constructor for singleton pattern
        setInterval(() => {
            // Reset counter every minute
            this.rpcCallCount = 0;
            this.rpcCallResetTime = Date.now();
            logger.debug(`[RateLimiter] Reset RPC call counter. Current utilization: ${this.getUtilizationPercent()}%`);
        }, 60000);
    }
    
    public static getInstance(): RpcRateLimiter {
        if (!RpcRateLimiter.instance) {
            RpcRateLimiter.instance = new RpcRateLimiter();
        }
        return RpcRateLimiter.instance;
    }
    
    public checkLimit(): boolean {
        if (this.rpcCallCount >= this.MAX_RPC_CALLS_PER_MINUTE) {
            logger.warn(`[RateLimiter] RPC call limit reached (${this.MAX_RPC_CALLS_PER_MINUTE}/min). Throttling.`);
            return false;
        }
        this.rpcCallCount++;
        return true;
    }
    
    public getUtilizationPercent(): number {
        return Math.round((this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE) * 100);
    }
    
    public getCurrentCount(): number {
        return this.rpcCallCount;
    }
    
    public getMaxCount(): number {
        return this.MAX_RPC_CALLS_PER_MINUTE;
    }
}

// Export the rate limiter for use in other modules
export const globalRateLimiter = RpcRateLimiter.getInstance();

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

function loadSystemState(stateFilePath: string): Partial<RiskMetrics> | null {
    if (fs.existsSync(stateFilePath)) {
        try {
            const stateJson = fs.readFileSync(stateFilePath, 'utf-8');
            const state = JSON.parse(stateJson);
            logger.info(`Loaded system state from ${stateFilePath}`, { stateKeys: Object.keys(state).join(', ') });
            // Basic validation (ensure it's an object)
            if (typeof state === 'object' && state !== null) {
                return state as Partial<RiskMetrics>;
            } else {
                logger.warn(`Invalid state file format found at ${stateFilePath}. Starting fresh.`);
                return null;
            }
        } catch (error: any) {
            logger.error(`Failed to load or parse state file ${stateFilePath}: ${error?.message}`);
            return null; // Start fresh if loading fails
        }
    }
    logger.info(`No state file found at ${stateFilePath}. Starting fresh.`);
    return null;
}

function saveSystemState(riskManager: RiskManager | null, stateFilePath: string) {
    if (!riskManager) {
        logger.warn('RiskManager not initialized, cannot save state.');
        return;
    }
    try {
        const stateToSave = riskManager.getMetrics();

        logger.debug(`Attempting to write state to: ${stateFilePath}`); // Log path before writing

        fs.writeFileSync(stateFilePath, JSON.stringify(stateToSave, null, 2));
        logger.debug(`System state saved to ${stateFilePath}`);

    } catch (error: any) {
        logger.error(`Failed to save system state to ${stateFilePath}: ${error?.message}`);
    }
}

/**
 * SolMemeBot Production Launch Script
 * Handles safe initialization and operation of the trading system
 */
async function launchTradingSystem() {
    logger.info('Entered launchTradingSystem()');
    let riskManager: RiskManager | null = null; // Keep riskManager accessible for shutdown handler
    let saveIntervalId: NodeJS.Timeout | null = null; // Keep interval ID accessible
    let newCoinDetector: NewCoinDetector | null = null; // Keep detector accessible
    let priceWatcher: PriceWatcher | null = null; // Keep watcher accessible
    let tradingEngine: TradingEngine | null;

    logger.info('Starting SolMemeBot Trading System', { 
        production: PRODUCTION_MODE,
        dryRun: DRY_RUN_MODE,
        timestamp: new Date().toISOString()
    });

    try {
        // 1. Verify configuration
        logger.info('About to verify system configuration...');
        const configResult = await verifyConfig();
        
        if (!configResult.isValid) {
            logger.error('Configuration verification failed', configResult);
            await sendAlert('Failed to start trading system: Invalid configuration', 'CRITICAL');
            process.exit(1);
        }
        
        logger.info('Configuration validated successfully');
        logger.info('About to check data directory...');

        // Define and ensure data directory exists
        // Use absolute path to avoid potential relative path issues
        const dataDir = path.resolve(config.trading.dataDirectory);
        const stateFilePath = path.join(dataDir, 'bot_state.json');

        logger.info(`Checking data directory path: ${dataDir}`); // Log the path

        // Force creation attempt - mkdirSync with recursive:true is safe if dir exists
        try {
            fs.mkdirSync(dataDir, { recursive: true });
            logger.info(`Ensured data directory exists: ${dataDir}`); // Log success/existence
        } catch (mkdirError: any) {
            logger.error(`Failed to ensure data directory ${dataDir} exists: ${mkdirError?.message}`);
            // This is likely fatal if we can't create/access the data directory
            process.exit(1);
        }

        logger.info('About to set up core components...');
        // 2. Setup core components
        const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
        if (!privateKeyStr) {
            logger.error('FATAL: SOLANA_PRIVATE_KEY is not set in the environment variables.');
            await sendAlert('FATAL: SOLANA_PRIVATE_KEY is not set!', 'CRITICAL');
            process.exit(1);
        }
        const privateKey = bs58.decode(privateKeyStr);
        const wallet = Keypair.fromSecretKey(privateKey);
        
        // Use QuickNode for optimal performance with memecoin trading
        const rpcEndpoint = config.solana.rpcEndpoint;
        const wssEndpoint = config.solana.wssEndpoint;

        if (!rpcEndpoint || typeof rpcEndpoint !== 'string') {
            logger.error(`FATAL: Invalid Solana RPC endpoint configured: ${rpcEndpoint}`);
            process.exit(1);
        }

        if (!wssEndpoint || typeof wssEndpoint !== 'string') {
            logger.warn(`WARNING: Missing WebSocket endpoint. WebSocket-based detection will not work.`);
        }

        logger.info(`Connecting with QuickNode RPC: ${rpcEndpoint}`); 
        if (wssEndpoint) logger.info(`Using QuickNode WebSocket: ${wssEndpoint}`);

        // Create a rate-limited connection to prevent excessive RPC calls
        const connection = new Connection(rpcEndpoint, {
            commitment: 'confirmed',
            wsEndpoint: wssEndpoint,
            // Use these options to optimize RPC usage
            disableRetryOnRateLimit: true, // Don't retry automatically on rate limits
            confirmTransactionInitialTimeout: 60000 // 60 seconds timeout for confirmations
        });
        
        // Add a warning about QuickNode limits
        logger.info(`[RateLimiter] Using global rate limiter with max ${globalRateLimiter.getMaxCount()} RPC calls per minute`);
        logger.warn('IMPORTANT: Monitor QuickNode usage carefully to avoid exceeding your plan limits.');
        
        logger.info('About to initialize PriceWatcher...');
        // 2.5 Initialize PriceWatcher
        logger.info('Initializing price watcher system...');
        priceWatcher = new PriceWatcher(connection, config); // Instantiate PriceWatcher

        logger.info('About to initialize TradingEngine...');
        // 2.6 Initialize TradingEngine
        if (!wallet) { // Ensure wallet is loaded before passing
            throw new Error('Wallet Keypair not loaded, cannot initialize TradingEngine.');
        }
        tradingEngine = new TradingEngine(connection, config, wallet);
        
        logger.info('About to check wallet balances...');
        // 3. Check wallet balances
        logger.info('Checking wallet balances...');
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
        
        logger.info('About to load state before initializing Risk Manager...');
        // --- Load State BEFORE Initializing Risk Manager ---
        const loadedState = loadSystemState(stateFilePath);

        logger.info('About to initialize Risk Manager...');
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
        
        logger.info('About to set up circuit breaker event handler...');
        // Setup circuit breaker event handler
        riskManager.on('circuitBreaker', async (data) => {
            const { reason, message, timestamp } = data;
            logger.warn('Circuit breaker triggered', { reason, message, timestamp });
            await sendAlert(`Circuit breaker triggered: ${reason} - ${message ?? 'No details'}`, 'WARNING'); // Added nullish coalescing for message
            saveSystemState(riskManager, stateFilePath); // Save state when breaker triggers
        });
        
        logger.info('About to set up emergency stop event handler...');
        // Setup emergency stop event handler
        riskManager.on('emergencyStop', async (data) => {
            const { reason, message, timestamp } = data;
            logger.error('EMERGENCY STOP ACTIVATED', { reason, message, timestamp });
            await sendAlert(`🚨 EMERGENCY STOP ACTIVATED: ${reason} - ${message ?? 'No details'}`, 'CRITICAL'); // Added nullish coalescing for message
            saveSystemState(riskManager, stateFilePath); // Save state on emergency stop
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
        
        logger.info('About to initialize Order Execution...');
        // 5. Initialize Order Execution
        logger.info('Initializing order execution system...');
        const orderExecutionConfig: OrderExecutionConfig = { slippageBps: config.trading.jupiterSlippageBps };
        const orderExecution = new LiveOrderExecution(connection, wallet, orderExecutionConfig);
        // No initialize needed for the new class structure
        
        logger.info('About to initialize New Coin Detector...');
        // 7. Initialize New Coin Detector
        logger.info('Initializing new coin detection system...');
        // Revert diagnostic assertion - type should now be correctly inferred
        newCoinDetector = new NewCoinDetector(connection, config);

        logger.info('About to set up New Pool Detected Event Listener...');
        // --- Setup New Pool Detected Event Listener --- 
        newCoinDetector.on('newPoolDetected', (eventData: NewPoolDetectedEvent) => {
            logger.info(`[Launch] Detected new pool via event: Base Mint ${eventData.baseMint}, Pool ${eventData.poolAddress}, Quote ${eventData.quoteMint}`);

            // Start watching this token with the PriceWatcher
            // Pass both the token mint (baseMint) and the pool address
            if (priceWatcher) {
                priceWatcher.watchToken(eventData.baseMint, eventData.poolAddress);
            } else {
                logger.error('[Launch] PriceWatcher not initialized when newPoolDetected event was received. Cannot watch token.');
            }

            // TODO: Potentially trigger initial evaluation by TradingEngine immediately?
            // tradingEngine.evaluateToken(tokenMint);
        });

        logger.info('About to connect PriceWatcher to Trading Engine...');
        // --- Connect PriceWatcher to Trading Engine --- 
        if (priceWatcher && tradingEngine) {
            logger.info('[Launch] Connecting PriceWatcher marketDataUpdate events to TradingEngine...');
            priceWatcher.on('marketDataUpdate', (marketData) => {
                tradingEngine?.evaluateToken(marketData); // Use optional chaining just in case
            });
        } else {
            logger.error('[Launch] Failed to connect PriceWatcher and TradingEngine. One or both are not initialized.');
        }

        logger.info('About to set up State Persistence & Shutdown Hooks...');
        // --- Setup State Persistence & Shutdown Hooks ---
        logger.info(`Setting up periodic state save every ${SAVE_INTERVAL_MS / 60000} minutes.`);
        saveSystemState(riskManager, stateFilePath); // Initial save after setup
        saveIntervalId = setInterval(() => {
            saveSystemState(riskManager, stateFilePath);
        }, SAVE_INTERVAL_MS);

        const shutdown = async (signal: string) => {
            logger.info(`Received ${signal}. Graceful shutdown initiated...`);
            if (saveIntervalId) clearInterval(saveIntervalId); // Stop periodic saves
            
            // Add any other cleanup needed (e.g., close WebSocket connections)
            logger.info('Closing Helius WebSocket...');
            // TODO: Check if HeliusAPI class has a disconnect/cleanup method and call it.
            // if (heliusApi && typeof heliusApi.disconnect === 'function') heliusApi.disconnect();
            if (newCoinDetector) newCoinDetector.stop(); // Call the detector's stop method for cleanup
            if (priceWatcher) priceWatcher.stop(); // Stop the price watcher

            logger.info('Saving final system state...');
            saveSystemState(riskManager, stateFilePath); // Perform final save

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
            // Cannot save here, riskManager/stateFilePath likely out of scope
            setTimeout(() => process.exit(1), 3000); // Exit after attempting save
        });
        process.on('unhandledRejection', async (reason, promise) => {
             logger.error(`CRITICAL: Unhandled Rejection at: ${promise}`, reason);
             // Attempt to save state before crashing
             logger.info('Attempting emergency state save before exiting due to unhandled rejection...');
             // Cannot save here, riskManager/stateFilePath likely out of scope
             setTimeout(() => process.exit(1), 3000); // Exit after attempting save
        });

        logger.info('About to start systems (Dry Run or Production)...');
        // 8. Start Systems (Dry Run or Production)
        if (DRY_RUN_MODE) {
            logger.info('Starting in DRY RUN mode - no trades will be executed');
            // Start the new coin detector
            if (newCoinDetector) newCoinDetector.start();
            
            if (priceWatcher) {
                logger.info('Starting Price Watcher...');
                priceWatcher.start(); // Start PriceWatcher polling
            }
            
            await sendAlert('Trading system started in DRY RUN mode', 'INFO');
            logger.info('Dry run mode active. Monitoring events...');
            // Dry run might run indefinitely or have a duration based on env var

        } else if (PRODUCTION_MODE) {
            logger.info('Starting in PRODUCTION mode');
            
            // Set up health check for production
            const healthCheckIntervalId = setInterval(async () => {
                try {
                    // Check rate limiter before making RPC calls
                    if (!globalRateLimiter.checkLimit()) {
                        logger.warn('[HealthCheck] Skipping health check due to rate limiting');
                        return;
                    }
                    
                    // Check connection health
                    const slot = await connection.getSlot();
                    logger.info(`Health check: Current slot ${slot}`);
                    
                    // Check rate limiter again before making another RPC call
                    if (!globalRateLimiter.checkLimit()) {
                        logger.warn('[HealthCheck] Skipping wallet balance check due to rate limiting');
                        return;
                    }
                    
                    // Check wallet balance
                    const walletBalance = await connection.getBalance(wallet.publicKey);
                    const solBalance = walletBalance / LAMPORTS_PER_SOL;
                    logger.info(`Wallet balance: ${solBalance.toFixed(4)} SOL`);
                    
                    if (solBalance < 0.05) {
                        await sendAlert(`LOW BALANCE ALERT: Wallet balance is ${solBalance.toFixed(4)} SOL`, 'WARNING');
                    }
                    
                    // Check for active positions
                    if (tradingEngine) {
                        const activePositions = tradingEngine.getActivePositions();
                        logger.info(`Active positions: ${activePositions.length}`);
                    }
                    
                    // Log RPC usage stats
                    logger.info(`[RateLimiter] Current RPC utilization: ${globalRateLimiter.getUtilizationPercent()}% (${globalRateLimiter.getCurrentCount()}/${globalRateLimiter.getMaxCount()} calls)`);
                } catch (error) {
                    logger.error('Health check failed:', error);
                }
            }, 5 * 60 * 1000); // Every 5 minutes
            
            // Start all components
            if (newCoinDetector) {
                logger.info('Starting NewCoinDetector in PRODUCTION mode...');
                newCoinDetector.start();
            }

            if (priceWatcher) {
                logger.info('Starting PriceWatcher in PRODUCTION mode...');
                priceWatcher.start();
            }

            await sendAlert('Trading system started in PRODUCTION mode with QuickNode', 'INFO');
            logger.info('Production mode active. Monitoring for trading opportunities...');

        } else {
            logger.warn('Not in PRODUCTION or DRY_RUN mode. Starting discovery/detection but NO TRADING.');
            // Start services but maybe don't connect patternDetector to orderExecution fully?
            if (newCoinDetector) newCoinDetector.start();

            if (priceWatcher) {
                logger.info('Starting Price Watcher...');
                priceWatcher.start(); // Start PriceWatcher polling
            }
            await sendAlert('Trading system started in Development/Test mode', 'INFO');
        }

    } catch (error: any) {
        logger.error('Fatal error during system launch:', error);
        await sendAlert(`FATAL LAUNCH ERROR: ${error.message}`, 'CRITICAL');
        // Attempt final save even on launch error
        logger.info('Attempting state save after launch failure...');
        // Cannot save here, riskManager/stateFilePath likely out of scope
        process.exit(1);
    }
}

// Run when invoked directly
if (require.main === module) {
    launchTradingSystem().catch(error => {
        logger.error('Unhandled promise rejection during launch:', error);
        // Attempt final save
        // Cannot save here, riskManager/stateFilePath likely out of scope
        process.exit(1);
    });
}
