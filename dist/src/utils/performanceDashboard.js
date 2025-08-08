import express from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import logger from './logger.js';
export class PerformanceDashboard {
    patternEventCounts = {};
    pendingExits = [];
    app;
    server = null;
    riskManager;
    port;
    dataDir;
    refreshInterval;
    performanceHistory = [];
    tradeHistory = [];
    pnlSeries = [];
    constructor(options) {
        this.app = express();
        this.riskManager = options.riskManager;
        this.port = options.port || 3000;
        this.dataDir = options.dataDir || './data/performance';
        this.refreshInterval = options.refreshInterval || 5000;
        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        this.setupRoutes();
    }
    setupRoutes() {
        const app = this.app;
        // Serve static assets
        app.use(express.static(path.join(__dirname, '../../public')));
        // Monitoring endpoints
        app.get('/api/trades', (req, res) => {
            res.json(this.tradeHistory.slice(-100));
        });
        app.get('/api/pnl', (req, res) => {
            res.json(this.pnlSeries.slice(-100));
        });
        app.get('/metrics', (req, res) => {
            // Prometheus format
            const metrics = this.riskManager.getMetrics();
            // Trades/sec (last 5 min)
            const now = Date.now();
            const tradesLast5m = (this.tradeHistory || []).filter((t) => now - t.timestamp < 5 * 60 * 1000);
            const tradesPerSec = tradesLast5m.length / 300;
            // Avg PnL
            const pnls = (this.tradeHistory || []).map((t) => t.pnl).filter((p) => typeof p === 'number');
            const avgPnl = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
            // Drawdown pct
            const drawdownPct = metrics.drawdownMax && metrics.highWaterMark
                ? (metrics.drawdownMax / metrics.highWaterMark) * 100
                : 0;
            // RPC error count (example, should be incremented elsewhere)
            const rpcErrorCount = global['rpcErrorCount'] || 0;
            let output = '';
            output += `trades_executed_total ${metrics.tradesExecuted || 0}\n`;
            output += `trades_per_sec ${tradesPerSec}\n`;
            output += `avg_pnl ${avgPnl}\n`;
            output += `drawdown_max ${metrics.drawdownMax || 0}\n`;
            output += `drawdown_pct ${drawdownPct}\n`;
            output += `rpc_error_count ${rpcErrorCount}\n`;
            // Add RPC/API call metrics
            try {
                const { getRpcCallMetricsPrometheus } = require('./rpcUsageTracker');
                output += getRpcCallMetricsPrometheus() + '\n';
            }
            catch (e) { }
            res.set('Content-Type', 'text/plain');
            res.send(output);
        });
        app.get('/health', (req, res) => {
            res.json({ status: 'ok', time: new Date().toISOString() });
        });
        // API routes
        app.get('/api/metrics', (req, res) => {
            const metrics = this.riskManager.getMetrics();
            res.json(metrics);
        });
        app.get('/api/performance', (req, res) => {
            res.json(this.performanceHistory.slice(-100)); // Return last 100 data points
        });
        app.get('/api/status', (req, res) => {
            const metrics = this.riskManager.getMetrics();
            const circuitBreakers = metrics.circuitBreakers;
            const emergencyStop = metrics.emergencyStopActive;
            const systemEnabled = metrics.systemEnabled;
            res.json({
                status: systemEnabled ? (emergencyStop ? 'EMERGENCY_STOP' : 'RUNNING') : 'DISABLED',
                circuitBreakers,
                lastUpdated: new Date().toISOString(),
            });
        });
        app.get('/api/pattern-events', (req, res) => {
            // Example: { pumpDump: 3, smartTrap: 1, squeeze: 2 }
            res.json(this.patternEventCounts || {});
        });
        app.get('/api/pending-exits', (req, res) => {
            // Example: [{ address, stopLoss, takeProfit, entryPrice, timestamp }]
            res.json(this.pendingExits || []);
        });
        // Main dashboard HTML
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
        });
    }
    start() {
        return new Promise((resolve) => {
            this.server = http.createServer(this.app).listen(this.port, () => {
                logger.info(`Performance dashboard running on port ${this.port}`);
                // Start metrics collection
                this.startMetricsCollection();
                resolve();
            });
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                return resolve();
            }
            this.server.close((err) => {
                if (err) {
                    return reject(err);
                }
                logger.info('Performance dashboard stopped');
                resolve();
            });
        });
    }
    startMetricsCollection() {
        // Record metrics periodically
        setInterval(() => {
            try {
                const metrics = this.riskManager.getMetrics();
                const timestamp = new Date().toISOString();
                const performancePoint = {
                    timestamp,
                    ...metrics,
                };
                this.performanceHistory.push(performancePoint);
                // Truncate history to avoid memory issues
                if (this.performanceHistory.length > 1000) {
                    this.performanceHistory = this.performanceHistory.slice(-1000);
                }
                // Save performance data to disk periodically (every hour)
                const minutes = new Date().getMinutes();
                if (minutes === 0) {
                    this.savePerformanceData();
                }
            }
            catch (error) {
                logger.error('Error collecting metrics', error);
            }
        }, this.refreshInterval);
    }
    savePerformanceData() {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filePath = path.join(this.dataDir, `performance-${date}.json`);
            fs.writeFileSync(filePath, JSON.stringify(this.performanceHistory, null, 2));
            logger.debug('Performance data saved to disk', { file: filePath });
        }
        catch (error) {
            logger.error('Error saving performance data', error);
        }
    }
}
export default PerformanceDashboard;
//# sourceMappingURL=performanceDashboard.js.map