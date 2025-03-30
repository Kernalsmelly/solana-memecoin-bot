"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const newCoinDetector_1 = require("../demo/newCoinDetector");
const paperTrading_1 = require("./paperTrading");
const notificationManager_1 = require("../live/notificationManager");
const logger_1 = __importDefault(require("../utils/logger"));
async function main() {
    // Initialize components
    const detector = new newCoinDetector_1.NewCoinDetector({
        minLiquidity: 5000,
        maxAgeHours: 72,
        scanIntervalSec: 10
    });
    const notificationManager = new notificationManager_1.NotificationManager({
        notifyLevel: 'all'
    });
    const paperTrading = new paperTrading_1.PaperTradingEngine({
        initialBalance: 1000,
        maxPositions: 3,
        maxPositionSize: 50,
        maxDrawdown: 20,
        notificationManager
    });
    // Set up event handlers
    detector.on('tradingSignal', (signal) => {
        paperTrading.processSignal(signal).catch(error => {
            logger_1.default.error('Error processing trading signal:', error);
        });
    });
    // Start monitoring
    await detector.startMonitoring();
    // Cleanup on exit
    process.on('SIGINT', async () => {
        await detector.stopMonitoring();
        await notificationManager.cleanup();
        process.exit(0);
    });
}
main().catch(error => {
    logger_1.default.error('Error in paper trading test:', error);
    process.exit(1);
});
