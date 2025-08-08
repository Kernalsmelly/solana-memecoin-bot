import { NewCoinDetector } from '../demo/newCoinDetector.js';
import { TradingEngine } from './tradingEngine.js';
import { NotificationManager } from './notificationManager.js';
import { startMetricsServer } from './metricsServer.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
dotenv.config();
async function main() {
    // Initialize notification manager
    const notificationManager = new NotificationManager({
        discord: process.env.DISCORD_WEBHOOK ? {
            webhookUrl: process.env.DISCORD_WEBHOOK
        } : undefined,
        notifyLevel: 'all'
    });
    // Initialize trading engine
    const tradingEngine = new TradingEngine({
        maxPositions: 3,
        maxPositionSize: 50,
        maxDrawdown: 20,
        notificationManager
    });
    // Start Prometheus metrics server
    // @ts-ignore
    startMetricsServer(tradingEngine.riskManager, notificationManager, 9469);
    // Initialize coin detector
    const detector = new NewCoinDetector({
        minLiquidity: 5000,
        maxAgeHours: 72,
        scanIntervalSec: 10
    });
    // Set up event handlers
    detector.on('tradingSignal', (signal) => {
        tradingEngine.processSignal(signal).catch((error) => {
            logger.error('Error processing trading signal:', error);
        });
    });
    // Start monitoring
    await detector.startMonitoring();
    // Force close all open positions every 10 seconds
    setInterval(() => {
        for (const position of tradingEngine.getPositions()) {
            // Force a price update below stop loss
            tradingEngine.updatePrice(position.tokenAddress, position.stopLoss - 0.00001);
        }
    }, 10000);
    // Cleanup on exit
    process.on('SIGINT', async () => {
        await detector.stopMonitoring();
        await notificationManager.cleanup();
        process.exit(0);
    });
}
main().catch(error => {
    logger.error('Error in live trading test:', error);
    process.exit(1);
});
//# sourceMappingURL=testLive.js.map