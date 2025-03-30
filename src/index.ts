import { NewCoinDetector } from './services/newCoinDetector';
import { NotificationManager } from './live/notificationManager';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { BirdeyeAPI } from './api/birdeyeAPI';
import { LiveOrderExecution } from './orderExecution';
import { RiskManager } from './live/riskManager';
import { ExitManager, ExitManagerConfig, ManagedPosition } from './strategy/exitManager';
import { PortfolioOptimizer } from './strategy/portfolioOptimizer';
import logger from './utils/logger';
import dotenv from 'dotenv';
import { 
  PatternDetection, 
  Position,
  TradeOrder,
  OrderExecutionResult
} from './types';
import { CoinDetectorConfig } from './services/newCoinDetector';

dotenv.config();

// --- Environment Variable Validation ---
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;

if (!SOLANA_RPC_URL || !SOLANA_PRIVATE_KEY || !BIRDEYE_API_KEY) {
    logger.error('Missing required environment variables: SOLANA_RPC_URL, SOLANA_PRIVATE_KEY, BIRDEYE_API_KEY');
    process.exit(1);
}

let wallet: Keypair;
try {
    wallet = Keypair.fromSecretKey(bs58.decode(SOLANA_PRIVATE_KEY));
    logger.info(`Wallet loaded: ${wallet.publicKey.toBase58()}`);
} catch (error) {
    logger.error('Failed to decode SOLANA_PRIVATE_KEY. Ensure it is a base58 encoded secret key.', error);
    process.exit(1);
}

// --- Main Application Setup ---
async function main() {
    // Re-check critical keys just before use to satisfy TypeScript
    if (!SOLANA_PRIVATE_KEY) {
        throw new Error('SOLANA_PRIVATE_KEY is unexpectedly undefined');
    }

    // Declare NotificationManager outside try block to use in catch
    let notificationManager: NotificationManager | null = null;

    try {
        // Initialize notification manager
        notificationManager = new NotificationManager({
            discord: process.env.DISCORD_WEBHOOK ? {
                webhookUrl: process.env.DISCORD_WEBHOOK
            } : undefined,
            telegram: process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_SESSION && process.env.TELEGRAM_CHAT_ID ? {
                apiId: parseInt(process.env.TELEGRAM_API_ID),
                apiHash: process.env.TELEGRAM_API_HASH || '', // Add default
                sessionString: process.env.TELEGRAM_SESSION || '', // Add default
                chatId: process.env.TELEGRAM_CHAT_ID || '' // Add default
            } : undefined,
            notifyLevel: (process.env.NOTIFY_LEVEL as any) || 'all' // Cast to any to allow string values
        });

        // 1. Initialize Core Services
        logger.info(`Initializing core services...`);
        logger.info(`Using wallet: ${wallet.publicKey.toBase58()}`);
        logger.info(`Connecting to Solana RPC: ${SOLANA_RPC_URL}`);
        const connection = new Connection(SOLANA_RPC_URL!, 'confirmed');

        const birdeyeApi = new BirdeyeAPI(BIRDEYE_API_KEY!); // Use non-null assertion
        const orderExecution = new LiveOrderExecution(connection, wallet, {
            slippageBps: parseInt(process.env.JUPITER_SLIPPAGE_BPS || '100') // Default 1%
        });
        // Provide RiskManager configuration from env vars or defaults
        const riskManager = new RiskManager({
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
        const exitManagerConfig: Partial<ExitManagerConfig> = { 
            // Example overrides
            lossExits: { stopLoss: -15 }, // 15% stop loss default
            trailingStops: { enabled: true, activationThreshold: 20, trailPercent: 10 },
        };
        const exitManager = new ExitManager(orderExecution, riskManager, birdeyeApi, exitManagerConfig);

        // 2. Initialize Portfolio Optimizer
        const portfolioOptimizer = new PortfolioOptimizer({
            orderExecution: orderExecution,
            riskManager: riskManager,
            birdeyeApi: birdeyeApi,
            exitManager: exitManager, // PortfolioOptimizer needs ExitManager ref
            maxPortfolioAllocationPercent: parseFloat(process.env.MAX_PORTFOLIO_ALLOCATION || '50'), // 50% of capital
            targetPositionValueUsd: parseFloat(process.env.TARGET_POSITION_VALUE_USD || '50'), // Target $50 per position
            minPositionValueUsd: parseFloat(process.env.MIN_POSITION_VALUE_USD || '10'),    // Min $10 per position
            maxPositions: parseInt(process.env.MAX_POSITIONS || '5') // Max 5 positions
        });

        // 3. Initialize Token Detection (Replace Demo Detector)
        // Example: Using Birdeye WebSocket Integration (assuming class exists)
        // const tokenDetector = new BirdeyeTokenDetector(BIRDEYE_API_KEY, { /* config */ });
        // For now, keep the demo detector to avoid breaking execution, but mark as TODO
        logger.info('Initializing Real New Coin Detector...');
        const detectorConfig: CoinDetectorConfig = {
            minLiquidity: parseFloat(process.env.MIN_LIQUIDITY || '5000'), // Default $5000
            maxAgeHours: parseFloat(process.env.MAX_TOKEN_AGE_HOURS || '24'), // Default 24 hours
            scanIntervalSec: parseInt(process.env.DETECTOR_SCAN_INTERVAL_SEC || '60'), // Default 60 seconds
            birdeyeApiKey: BIRDEYE_API_KEY!, // Required - Use non-null assertion
            defaultStopLossPercent: parseFloat(process.env.DEFAULT_STOP_LOSS_PERCENT || '10'), // Default 10%
            defaultTimeframe: process.env.DEFAULT_TIMEFRAME || '15m', // Default 15 minutes
        };
        const newCoinDetector = new NewCoinDetector(detectorConfig);
        logger.info('New Coin Detector initialized.');

        // --- Event Wiring ---
        logger.info('Wiring up event listeners...');

        // 1. Detector finds a potential pattern -> Optimizer evaluates it
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
        await notificationManager.notifyInfo('Bot starting up...');
        exitManager.start(); // Start ExitManager monitoring loops
        await newCoinDetector.start(); // Use start() instead of startScanning()

        logger.info('Trading bot is running.');

    } catch (error: unknown) { 
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Unhandled error during bot initialization or runtime:', { message: errorMessage, originalError: error });
        try {
            // Attempt to notify about the critical failure if manager was initialized
            notificationManager?.notifyError(`CRITICAL BOT FAILURE: ${errorMessage}`);
        } catch (notificationError) {
            logger.error('Failed to send error notification:', notificationError);
        }
        process.exit(1); // Exit on critical failure
    } /* No finally block needed as process exits or continues */
    // We don't reach here if startDetection runs indefinitely or process exits
    logger.info('Bot initialization sequence complete. Running...');
};

main().catch(error => {
    logger.error('Error in main:', error);
    process.exit(1);
});
