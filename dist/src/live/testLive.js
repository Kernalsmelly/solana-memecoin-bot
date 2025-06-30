"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const newCoinDetector_1 = require("../demo/newCoinDetector");
const tradingEngine_1 = require("./tradingEngine");
const notificationManager_1 = require("./notificationManager");
const logger_1 = __importDefault(require("../utils/logger"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function main() {
    // Initialize notification manager
    const notificationManager = new notificationManager_1.NotificationManager({
        discord: process.env.DISCORD_WEBHOOK ? {
            webhookUrl: process.env.DISCORD_WEBHOOK
        } : undefined,
        telegram: process.env.TELEGRAM_API_ID ? {
            apiId: parseInt(process.env.TELEGRAM_API_ID),
            apiHash: process.env.TELEGRAM_API_HASH || '',
            sessionString: process.env.TELEGRAM_SESSION || '',
            chatId: process.env.TELEGRAM_CHAT_ID || ''
        } : undefined,
        notifyLevel: 'all'
    });
    // Initialize trading engine
    const tradingEngine = new tradingEngine_1.TradingEngine({
        maxPositions: 3,
        maxPositionSize: 50,
        maxDrawdown: 20,
        notificationManager
    });
    // Initialize coin detector
    const detector = new newCoinDetector_1.NewCoinDetector({
        minLiquidity: 5000,
        maxAgeHours: 72,
        scanIntervalSec: 10
    });
    // Set up event handlers
    detector.on('tradingSignal', (signal) => {
        tradingEngine.processSignal(signal).catch(error => {
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
    logger_1.default.error('Error in live trading test:', error);
    process.exit(1);
});
//# sourceMappingURL=testLive.js.map