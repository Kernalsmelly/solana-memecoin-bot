import { NewCoinDetector } from '../demo/newCoinDetector.js';
import { PaperTradingEngine } from './paperTrading.js';
import { NotificationManager } from '../live/notificationManager.js';
import logger from '../utils/logger.js';
async function main() {
    // Initialize components
    const detector = new NewCoinDetector({
        minLiquidity: 5000,
        maxAgeHours: 72,
        scanIntervalSec: 10,
    });
    const notificationManager = new NotificationManager({
        notifyLevel: 'all',
    });
    const paperTrading = new PaperTradingEngine({
        initialBalance: 1000,
        maxPositions: 3,
        maxPositionSize: 50,
        maxDrawdown: 20,
        notificationManager,
    });
    // Set up event handlers
    detector.on('tradingSignal', (signal) => {
        paperTrading.processSignal(signal).catch((error) => {
            logger.error('Error processing trading signal:', error);
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
main().catch((error) => {
    logger.error('Error in paper trading test:', error);
    process.exit(1);
});
//# sourceMappingURL=testPaper.js.map