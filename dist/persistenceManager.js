"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistenceManager = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const logger_1 = __importDefault(require("./utils/logger"));
class PersistenceManager {
    dataDir;
    stateFile;
    historyFile;
    backupDir;
    constructor() {
        this.dataDir = (0, path_1.join)(process.cwd(), 'data');
        this.stateFile = (0, path_1.join)(this.dataDir, 'trading_state.json');
        this.historyFile = (0, path_1.join)(this.dataDir, 'trade_history.json');
        this.backupDir = (0, path_1.join)(this.dataDir, 'backups');
        // Create directories if they don't exist
        if (!(0, fs_1.existsSync)(this.dataDir)) {
            (0, fs_1.mkdirSync)(this.dataDir, { recursive: true });
        }
        if (!(0, fs_1.existsSync)(this.backupDir)) {
            (0, fs_1.mkdirSync)(this.backupDir);
        }
    }
    savePosition(position) {
        try {
            const state = this.loadState();
            state.positions = state.positions.filter(p => p.tokenAddress !== position.tokenAddress);
            state.positions.push(position);
            this.saveState(state);
        }
        catch (error) {
            logger_1.default.error('Error saving position:', error);
        }
    }
    deletePosition(tokenAddress) {
        try {
            const state = this.loadState();
            state.positions = state.positions.filter(p => p.tokenAddress !== tokenAddress);
            this.saveState(state);
        }
        catch (error) {
            logger_1.default.error('Error deleting position:', error);
        }
    }
    saveRiskMetrics(metrics) {
        try {
            const state = this.loadState();
            state.riskMetrics = metrics;
            this.saveState(state);
        }
        catch (error) {
            logger_1.default.error('Error saving risk metrics:', error);
        }
    }
    addTradeHistory(entry) {
        try {
            const history = this.loadTradeHistory();
            history.push(entry);
            (0, fs_1.writeFileSync)(this.historyFile, JSON.stringify(history, null, 2));
        }
        catch (error) {
            logger_1.default.error('Error adding trade history:', error);
        }
    }
    loadState() {
        try {
            if (!(0, fs_1.existsSync)(this.stateFile)) {
                return {
                    positions: [],
                    riskMetrics: {
                        currentBalance: 1000,
                        dailyPnL: 0,
                        drawdown: 0,
                        winRate: 0,
                        activePositions: 0,
                        availablePositions: 3,
                        highWaterMark: 1000,
                        dailyLoss: 0
                    },
                    timestamp: Date.now()
                };
            }
            const data = (0, fs_1.readFileSync)(this.stateFile, 'utf8');
            return JSON.parse(data);
        }
        catch (error) {
            logger_1.default.error('Error loading state:', error);
            return {
                positions: [],
                riskMetrics: {
                    currentBalance: 1000,
                    dailyPnL: 0,
                    drawdown: 0,
                    winRate: 0,
                    activePositions: 0,
                    availablePositions: 3,
                    highWaterMark: 1000,
                    dailyLoss: 0
                },
                timestamp: Date.now()
            };
        }
    }
    saveState(state) {
        try {
            (0, fs_1.writeFileSync)(this.stateFile, JSON.stringify(state, null, 2));
        }
        catch (error) {
            logger_1.default.error('Error saving state:', error);
        }
    }
    loadTradeHistory() {
        try {
            if (!(0, fs_1.existsSync)(this.historyFile)) {
                return [];
            }
            const data = (0, fs_1.readFileSync)(this.historyFile, 'utf8');
            return JSON.parse(data);
        }
        catch (error) {
            logger_1.default.error('Error loading trade history:', error);
            return [];
        }
    }
    exportTradeHistoryToCsv(outputFile) {
        try {
            const history = this.loadTradeHistory();
            const headers = ['timestamp', 'tokenAddress', 'tokenSymbol', 'action', 'price', 'size', 'pnl'];
            const rows = history.map(entry => {
                return [
                    new Date(entry.timestamp).toISOString(),
                    entry.position.tokenAddress,
                    entry.position.tokenSymbol,
                    entry.action,
                    entry.price,
                    entry.size,
                    entry.pnl || 0
                ].join(',');
            });
            const csv = [headers.join(','), ...rows].join('\n');
            (0, fs_1.writeFileSync)(outputFile, csv);
        }
        catch (error) {
            logger_1.default.error('Error exporting trade history:', error);
        }
    }
    createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = (0, path_1.join)(this.backupDir, `backup_${timestamp}.json`);
            const state = this.loadState();
            (0, fs_1.writeFileSync)(backupFile, JSON.stringify(state, null, 2));
        }
        catch (error) {
            logger_1.default.error('Error creating backup:', error);
        }
    }
}
exports.PersistenceManager = PersistenceManager;
//# sourceMappingURL=persistenceManager.js.map