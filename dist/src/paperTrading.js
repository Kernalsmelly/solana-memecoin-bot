"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPaperTrading = runPaperTrading;
const config_1 = require("./utils/config");
const logger_1 = __importDefault(require("./utils/logger"));
const orderExecution_1 = __importDefault(require("./orderExecution"));
const positionManager_1 = require("./positionManager"); // Ensure your PositionManager is implemented
const persistenceManager_1 = require("./persistenceManager"); // Ensure your PersistenceManager is implemented
const tokenMonitor_1 = __importDefault(require("./tokenMonitor"));
/**
 * Main function to run paper trading simulation.
 */
async function runPaperTrading() {
    try {
        logger_1.default.info("Starting paper trading simulation...");
        // Initialize Order Execution Module with configuration from config
        const orderExecution = new orderExecution_1.default({
            maxOrderSize: config_1.CONFIG.trading.maxPositionSize,
            exposureLimit: config_1.CONFIG.trading.initialBalance,
            slippageTolerance: config_1.CONFIG.trading.slippageTolerance,
            duplicateOrderTimeout: 1000, // You can adjust as needed
        });
        await orderExecution.initialize();
        // (Assume you already have implementations for these)
        // For example, create a position manager with your initial balance.
        const positionManager = new positionManager_1.PositionManager(config_1.CONFIG.trading.initialBalance);
        // Create a persistence manager using the data directory from config.
        const persistenceManager = new persistenceManager_1.PersistenceManager(config_1.CONFIG.trading.dataDirectory);
        // Create or initialize a token monitor instance.
        const tokenMonitor = new tokenMonitor_1.default();
        // (Optional) Set up event listeners on your tokenMonitor
        tokenMonitor.on('priceUpdate', (data) => {
            logger_1.default.info(`Price update: ${JSON.stringify(data)}`);
        });
        // Example: Execute a sample trade (buy order)
        const dummyTokenMint = "11111111111111111111111111111111"; // Replace with a valid token address if needed
        const sampleOrder = {
            tokenMint: dummyTokenMint,
            amount: 500, // For a market order, this could represent USD value or quantity based on your design
            orderType: 'market',
            slippageTolerance: 2,
            timeInForce: 'GTC'
        };
        logger_1.default.info("Executing sample trade order...");
        const tradeResult = await orderExecution.executeOrder(sampleOrder);
        if (tradeResult.success) {
            logger_1.default.info(`Trade executed: Order ID ${tradeResult.orderId}, Status: ${tradeResult.status}`);
            // (Optional) Update position manager with the new position
            // e.g., await positionManager.openPosition(...);
        }
        else {
            logger_1.default.error(`Trade failed: ${tradeResult.errorMessage}`);
        }
        // Simulate a price update event to test TokenMonitor integration:
        tokenMonitor.emit("priceUpdate", { tokenMint: dummyTokenMint, price: 100 });
        // Save state after trade if autoSave is enabled in your config.
        if (config_1.CONFIG.trading.autoSave) {
            // Ensure your persistenceManager.saveState returns a promise.
            await persistenceManager.saveState({
                // Build a TradingState object as per your PersistenceManager’s requirements.
                positions: positionManager.getAllPositions(),
                accountBalance: positionManager.getAccountBalance(),
                tradeHistory: [], // You might want to pass your trade history here
                lastUpdated: Date.now(),
            });
            logger_1.default.info("Trading state saved.");
        }
        // Final logging for paper trading simulation.
        logger_1.default.info("Paper trading simulation complete.");
        // Shut down modules gracefully.
        orderExecution.shutdown();
        tokenMonitor.removeAllListeners();
    }
    catch (error) {
        logger_1.default.error(`Error in paper trading simulation: ${error.message}`);
        throw error;
    }
}
// If this file is executed directly, run the simulation.
if (require.main === module) {
    runPaperTrading().catch(err => {
        logger_1.default.error(`Unhandled error in runPaperTrading: ${err}`);
        process.exit(1);
    });
}
