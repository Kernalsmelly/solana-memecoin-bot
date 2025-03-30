import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { NewCoinDetector } from '../demo/newCoinDetector';
import { TradingEngine } from '../live/tradingEngine';
import { NotificationManager } from '../live/notificationManager';
import logger from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Initialize components
const notificationManager = new NotificationManager({
    discord: process.env.DISCORD_WEBHOOK ? {
        webhookUrl: process.env.DISCORD_WEBHOOK
    } : undefined,
    notifyLevel: 'all'
});

const tradingEngine = new TradingEngine({
    maxPositions: 3,
    maxPositionSize: 50,
    maxDrawdown: 20,
    notificationManager
});

const detector = new NewCoinDetector({
    minLiquidity: 5000,
    maxAgeHours: 72,
    scanIntervalSec: 10
});

// Set up event handlers
detector.on('newToken', (address, metrics) => {
    io.emit('newToken', { address, metrics });
    logger.info(`New token detected: ${metrics.symbol}`, metrics);
});

detector.on('patternDetected', async (pattern) => {
    io.emit('patternDetected', pattern);
    logger.info(`Pattern detected: ${pattern.patternType}`, pattern);
    await notificationManager.notifyPattern(pattern);
});

detector.on('tradingSignal', async (signal) => {
    io.emit('tradingSignal', signal);
    logger.info(`Trading signal: ${signal.signalType}`, signal);
    await tradingEngine.processSignal(signal);
});

// Set up routes
app.use(express.static('public'));

app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        activePositions: tradingEngine['positions'].size,
        maxPositions: tradingEngine['maxPositions']
    });
});

// Start server
const port = process.env.PORT || 3000;
httpServer.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    detector.startMonitoring().catch(error => {
        logger.error('Error starting monitoring:', error);
    });
});

// Cleanup on exit
process.on('SIGINT', async () => {
    await detector.stopMonitoring();
    await notificationManager.cleanup();
    httpServer.close();
    process.exit(0);
});
