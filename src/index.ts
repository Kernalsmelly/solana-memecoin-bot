console.log('Cascade index.ts test: started');
import * as dotenv from 'dotenv';
import path from 'path'; // Import path module

// Load .env file from project root first thing
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  // eslint-disable-next-line no-console
  console.error('[GLOBAL] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[GLOBAL] Uncaught Exception:', err);
});


import { NewCoinDetector } from './services/newCoinDetector';
import { MultiSourceTokenDetector, MultiSourceTokenEvent } from './services/multiSourceTokenDetector';
import { NotificationManager } from './live/notificationManager';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor'; // Correct import for Wallet
import bs58 from 'bs58';
import { LiveOrderExecution } from './orderExecution';
import { RiskManager } from './live/riskManager';
import { ExitManager, ExitManagerConfig, ManagedPosition } from './strategy/exitManager';
import { PortfolioOptimizer } from './strategy/portfolioOptimizer';
import { setTimeout } from 'timers/promises';
import logger from './utils/logger';
import { config } from './utils/config'; // USE NAMED IMPORT
import verifyConfig from './utils/verifyConfig'; // Import default verifyConfig function
import { Config } from './utils/config'; // Keep Config type import if needed elsewhere
import { 
  PatternDetection, 
  Position,
  TradeOrder,
  OrderExecutionResult
} from './types';

// --- Environment Variable Validation ---
if (!process.env.SOLANA_RPC_URL || !process.env.SOLANA_PRIVATE_KEY) {
    logger.error('Missing required environment variables: SOLANA_RPC_URL, SOLANA_PRIVATE_KEY');
    process.exit(1);
}

// --- Main Application Setup ---
async function main() {
    logger.info('[DEBUG] Starting main()...');
    // Load and verify configuration first
    const validationResult = await verifyConfig(); // Remove 'config' argument
    if (!validationResult.isValid) {
        logger.error('Configuration validation failed. Please check .env file and logs.');
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
    let notificationManager: NotificationManager | null = null;
    let wallet: Wallet;
    let keypair: Keypair;

    try {
        // Decode Private Key and create Wallet
        const privateKeyString = config.solana.walletPrivateKey.trim(); // Correct property name
        if (!privateKeyString) {
            throw new Error('SOLANA_PRIVATE_KEY is missing or empty in config.');
        }
        const privateKeyBytes = bs58.decode(privateKeyString);
        keypair = Keypair.fromSecretKey(privateKeyBytes);
        wallet = new Wallet(keypair);
        logger.info(`Wallet loaded: ${wallet.publicKey.toBase58()}`);

        // Initialize notification manager using config
        notificationManager = new NotificationManager({
            discord: config.notifications.discordWebhookUrl ? {
                webhookUrl: config.notifications.discordWebhookUrl
            } : undefined,
            telegram: config.notifications.telegramApiId && config.notifications.telegramApiHash && config.notifications.telegramSessionString && config.notifications.telegramChatId ? {
                apiId: config.notifications.telegramApiId,
                apiHash: config.notifications.telegramApiHash,
                sessionString: config.notifications.telegramSessionString, // Corrected property name usage
                chatId: config.notifications.telegramChatId
            } : undefined,
            notifyLevel: config.notifications.notifyLevel || 'all' // Corrected property name usage
        });

        // 1. Initialize Core Services using config
        logger.info(`Initializing core services...`);
        logger.info(`Using wallet: ${wallet.publicKey.toBase58()}`);
        const connection = new Connection(config.solana.rpcEndpoint, 'confirmed');
        logger.info(`Connected to Solana RPC: ${config.solana.rpcEndpoint}`);

        // Correctly pass only slippageBps to LiveOrderExecution options
        const orderExecution = new LiveOrderExecution(connection, keypair, {
            slippageBps: config.trading.jupiterSlippageBps // Use config
        });

        // Provide RiskManager configuration from config
        const riskManager = new RiskManager({
            maxDrawdown: config.risk.maxDrawdownPercent,
            maxDailyLoss: config.risk.maxDailyLossPercent,
            maxPositions: config.risk.maxActivePositions, // Corrected property name
            maxPositionSize: config.trading.maxPositionSize, // Use trading.maxPositionSize (needs clarification SOL vs USD)
            maxPositionValueUsd: config.trading.targetPositionValueUsd, // Map from trading config
            maxLiquidityPercent: config.trading.maxLiquidityPercentage, // Corrected property name
            minPositionValueUsd: config.trading.minPositionValueUsd // Map from trading config
        });

        // Configure ExitManager with optimized settings from memory
        const exitManagerConfig: Partial<ExitManagerConfig> = { 
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
                stopLoss: config.risk.defaultStopLossPercent * -1, // Use default SL from config
                timeBasedStopAdjustment: { afterMinutes: 60, newStopPercent: -5 } // Tighten stop after 1 hour
            },
            trailingStops: { 
                enabled: config.risk.trailingStopEnabled ?? true,
                activationThreshold: config.risk.trailingStopActivationPercent ?? 15, // Start trailing at 15% profit
                trailPercent: config.risk.trailingStopTrailPercent ?? 10 // Trail by 10% of peak price
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
        // Initialize ExitManager with null for API client since we're not using it directly
        const exitManager = new ExitManager(orderExecution, riskManager, null, exitManagerConfig);

        // 2. Initialize Portfolio Optimizer
        const portfolioOptimizer = new PortfolioOptimizer({
            orderExecution: orderExecution,
            riskManager: riskManager,
            birdeyeApi: null, // We're not using BirdeyeAPI directly
            exitManager: exitManager, // PortfolioOptimizer needs ExitManager ref
            maxPortfolioAllocationPercent: config.risk.maxPortfolioAllocationPercent,
            targetPositionValueUsd: config.trading.targetPositionValueUsd,
            minPositionValueUsd: config.trading.minPositionValueUsd,
            maxPositions: config.risk.maxActivePositions
        });

        logger.info('Portfolio Optimizer initialized.');

        // 3. Initialize Token Detection 
        logger.info('Initializing Multi-Source Token Detector...');
        const multiSourceTokenDetector = new MultiSourceTokenDetector();
        logger.info('Multi-Source Token Detector initialized.');

        // --- Event Wiring ---
        logger.info('Wiring up event listeners...');

        logger.info('[DEBUG] Initializing PriceWatcher...');
        const priceWatcher = new (await import('./services/priceWatcher')).PriceWatcher(connection, config);
        logger.info('[DEBUG] PriceWatcher initialized.');

        // Force-watch a known active token (e.g., USDC) to test watcher/signal pipeline
        const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        logger.warn('[FORCE] Adding USDC to PriceWatcher for pipeline test');
        priceWatcher.watchToken(USDC_MINT);
        logger.info('[DEBUG] Called priceWatcher.watchToken(USDC_MINT)');

        // Listen for new tokens from Birdeye, Jupiter, Dexscreener
        try {
          logger.info('[DEBUG] Wiring MultiSourceTokenDetector event handler...');
          multiSourceTokenDetector.on('newTokenDetected', (evt: MultiSourceTokenEvent) => {
            logger.info(`[MultiSourceTokenDetector] New token detected from ${evt.source}: ${evt.mint} (${evt.symbol || ''})`);
            priceWatcher.watchToken(evt.mint, evt.poolAddress);
          });
          logger.info('[DEBUG] MultiSourceTokenDetector event handler wired.');
        } catch (e) {
          logger.error('[Startup] Error wiring MultiSourceTokenDetector:', e);
        }

        // Optionally keep NewCoinDetector for Raydium/legacy detection
        logger.info('Initializing New Coin Detector...');
        logger.info(`Using QuickNode RPC: ${config.solana.rpcEndpoint}`);
        logger.info(`Using QuickNode WSS: ${config.solana.wssEndpoint}`);
        const newCoinDetector = new NewCoinDetector(connection, config);
        logger.info('New Coin Detector initialized.');

        newCoinDetector.on('patternDetected', async (patternDetection: PatternDetection) => { 
            logger.info(`<<< Pattern Detected: ${patternDetection.pattern} for ${patternDetection.tokenAddress} >>>`);
            notificationManager?.notifyPattern(patternDetection);
            try {
                const newPosition: ManagedPosition | null = await portfolioOptimizer.evaluatePattern(patternDetection);

                if (newPosition) {
                    logger.info(`PortfolioOptimizer opened position for ${newPosition.tokenSymbol}, ID: ${newPosition.id}. Adding to ExitManager.`);
                    exitManager.addPosition(newPosition); // Explicitly tell ExitManager to monitor

                    // Prepare payload for notification (matches Position interface)
                    const quantityDecimal = Number(newPosition.quantity) / Math.pow(10, newPosition.tokenDecimals);
                    const sizeUsd = quantityDecimal * newPosition.currentPrice;

                    const openNotificationPayload: Position = {
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
                } else {
                    logger.info(`PortfolioOptimizer did not open a position for pattern ${patternDetection.pattern} on ${patternDetection.metrics.symbol}.`);
                }
            } catch (error: any) {
                logger.error(`Error evaluating pattern for ${patternDetection.tokenAddress}: ${error.message}`, { error });
                notificationManager?.notifyError(`Error evaluating pattern for ${patternDetection.tokenAddress}: ${error.message}`);
            }
        });

        // 3. Exit Manager closes a position -> Optimizer updates its state
        exitManager.on('exitSignal', (position: ManagedPosition, executionResult: OrderExecutionResult | null, reason: string) => { 
            logger.info(`<<< ExitManager closed position: ${position.tokenSymbol}, Reason: ${reason}`);

            let pnlPercent = 0; // Default PNL

            if (executionResult && executionResult.success && executionResult.outputAmount !== undefined && executionResult.outputAmount !== null) {
                // Calculate PNL based on SOL amounts if initial cost is available
                if (position.initialSolCostLamports !== undefined) {
                    const solReceivedLamports = executionResult.outputAmount; // SOL received from selling token
                    const initialSolCostLamports = position.initialSolCostLamports;
                    const pnlLamports = solReceivedLamports - initialSolCostLamports;
                    // Use Number for division, potential precision loss is acceptable for percentage display
                    pnlPercent = initialSolCostLamports > 0n ? (Number(pnlLamports) / Number(initialSolCostLamports)) * 100 : 0;
                    logger.info(`Trade closed successfully. PNL: ${pnlLamports} lamports (${pnlPercent.toFixed(2)}%). Tx: ${executionResult.txSignature}`);
                } else {
                    logger.warn(`Cannot calculate SOL-based PNL for ${position.id}, initialSolCostLamports is missing. Reporting 0% PNL.`);
                    // Optionally calculate price-based PNL as fallback here if needed
                }

                const exitPrice = executionResult.actualExecutionPrice ?? position.currentPrice; // Use actual exit price if available
                // Calculate quantity and size based on actual decimals
                const quantityDecimal = Number(position.quantity) / Math.pow(10, position.tokenDecimals);
                const sizeUsd = quantityDecimal * exitPrice;

                const closeNotificationPayload: Position = {
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
            } else {
                logger.error(`Exit trade failed or execution result missing for ${position.tokenSymbol} (${position.id}). Reason: ${reason}`, { error: executionResult?.error });
                notificationManager?.notifyError(`Exit trade failed for ${position.tokenSymbol}: ${executionResult?.error || 'Unknown error'}`);
                // Inform PortfolioOptimizer about the failed exit
                portfolioOptimizer.handlePositionExit(position.id, undefined, `Exit Failed: ${reason} - ${executionResult?.error || 'Unknown error'}`);
            }
        });

        // --- Start Services ---
        logger.info('Starting services...');
        await notificationManager.notifyInfo('Bot starting up in live trading mode...');
        
        // Start ExitManager monitoring loops
        logger.info('Starting ExitManager...');
        exitManager.start();
        
        // Start NewCoinDetector
        logger.info('Starting NewCoinDetector...');
        await newCoinDetector.start();
        
        // Set up a periodic check to ensure components are still running
        const healthCheckInterval = setInterval(() => {
            try {
                // Log basic health metrics
                const positions = portfolioOptimizer.getActivePositions();
                logger.info(`Health check: ${positions.length} active positions`);
                
                // Check RPC connection
                connection.getSlot().catch(err => {
                    logger.error('RPC connection error during health check:', err);
                    notificationManager?.notifyError(`RPC connection error: ${err.message}`);
                });
            } catch (error: any) {
                logger.error('Error during health check:', error);
            }
        }, 5 * 60 * 1000); // Every 5 minutes
        
        logger.info('Trading bot is running in live mode with QuickNode.');
        logger.info('Monitoring for new memecoin opportunities...');

    } catch (error: unknown) { 
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Unhandled error during bot initialization or runtime:', { message: errorMessage, originalError: error });
        try {
            // Attempt to notify about the critical failure if manager was initialized
            notificationManager?.notifyError(`CRITICAL BOT FAILURE: ${errorMessage}`);
            
            // Attempt to gracefully shut down any running components
            try {
                if (exitManager) exitManager.stop();
                if (newCoinDetector) newCoinDetector.stop();
            } catch (shutdownError) {
                logger.error('Error during emergency shutdown:', shutdownError);
            }
        } catch (notificationError) {
            logger.error('Failed to send error notification:', notificationError);
        }
        process.exit(1); // Exit on critical failure
    }
    
    // We don't reach here if process exits on error
    logger.info('Bot initialization sequence complete. Running...');
};

main().catch(error => {
    logger.error('Error in main:', error);
    process.exit(1);
});
