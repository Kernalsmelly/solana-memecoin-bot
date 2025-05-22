"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const newCoinDetector_1 = require("../demo/newCoinDetector");
const tradingEngine_1 = require("../live/tradingEngine");
const notificationManager_1 = require("../live/notificationManager");
const logger_1 = __importDefault(require("../utils/logger"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer);
// Initialize components
const notificationManager = new notificationManager_1.NotificationManager({
    discord: process.env.DISCORD_WEBHOOK ? {
        webhookUrl: process.env.DISCORD_WEBHOOK
    } : undefined,
    notifyLevel: 'all'
});
const tradingEngine = new tradingEngine_1.TradingEngine({
    maxPositions: 3,
    maxPositionSize: 50,
    maxDrawdown: 20,
    notificationManager
});
const detector = new newCoinDetector_1.NewCoinDetector({
    minLiquidity: 5000,
    maxAgeHours: 72,
    scanIntervalSec: 10
});
// Set up event handlers
detector.on('newToken', (address, metrics) => {
    io.emit('newToken', { address, metrics });
    logger_1.default.info(`New token detected: ${metrics.symbol}`, metrics);
});
detector.on('patternDetected', async (pattern) => {
    io.emit('patternDetected', pattern);
    logger_1.default.info(`Pattern detected: ${pattern.patternType}`, pattern);
    await notificationManager.notifyPattern(pattern);
});
detector.on('tradingSignal', async (signal) => {
    io.emit('tradingSignal', signal);
    logger_1.default.info(`Trading signal: ${signal.signalType}`, signal);
    await tradingEngine.processSignal(signal);
});
// Set up routes
app.use(express_1.default.static('public'));
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
    logger_1.default.info(`Server running on port ${port}`);
    detector.startMonitoring().catch(error => {
        logger_1.default.error('Error starting monitoring:', error);
    });
});
// Cleanup on exit
process.on('SIGINT', async () => {
    await detector.stopMonitoring();
    await notificationManager.cleanup();
    httpServer.close();
    process.exit(0);
});
//# sourceMappingURL=server.js.map