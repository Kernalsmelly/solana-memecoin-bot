"use strict";
// src/persistenceManager.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistenceManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class PersistenceManager {
    constructor(dataDir = './data') {
        this.dataDir = dataDir;
        this.stateFile = path_1.default.join(dataDir, 'trading_state.json');
        this.tradeHistoryFile = path_1.default.join(dataDir, 'trade_history.json');
        // Ensure data directory exists
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        }
    }
    /**
     * Save the current trading state
     */
    async saveState(tradingState) {
        try {
            // Add timestamp
            tradingState.lastUpdated = Date.now();
            // Convert to JSON string
            const stateJson = JSON.stringify(tradingState, null, 2);
            // Write to file
            await fs_1.default.promises.writeFile(this.stateFile, stateJson, 'utf8');
            // Also update trade history file
            await this.appendTradeHistory(tradingState.tradeHistory);
            console.log(`Trading state saved: ${this.stateFile}`);
        }
        catch (error) {
            console.error(`Failed to save trading state: ${error}`);
            throw error;
        }
    }
    /**
     * Load trading state from file
     */
    async loadState() {
        try {
            // Check if file exists
            if (!fs_1.default.existsSync(this.stateFile)) {
                console.log(`No trading state file found: ${this.stateFile}`);
                return null;
            }
            // Read file content
            const stateJson = await fs_1.default.promises.readFile(this.stateFile, 'utf8');
            // Parse JSON
            const tradingState = JSON.parse(stateJson);
            console.log(`Trading state loaded: ${this.stateFile}`);
            return tradingState;
        }
        catch (error) {
            console.error(`Failed to load trading state: ${error}`);
            return null;
        }
    }
    /**
     * Append new trades to trade history file
     */
    async appendTradeHistory(trades) {
        try {
            // Create or load existing history
            let history = [];
            if (fs_1.default.existsSync(this.tradeHistoryFile)) {
                const existingHistory = await fs_1.default.promises.readFile(this.tradeHistoryFile, 'utf8');
                history = JSON.parse(existingHistory);
            }
            // Filter out duplicate trades (by ID)
            const existingIds = new Set(history.map(trade => trade.id));
            const newTrades = trades.filter(trade => !existingIds.has(trade.id));
            // Add new trades
            history.push(...newTrades);
            // Sort by timestamp
            history.sort((a, b) => a.timestamp - b.timestamp);
            // Write back to file
            await fs_1.default.promises.writeFile(this.tradeHistoryFile, JSON.stringify(history, null, 2), 'utf8');
        }
        catch (error) {
            console.error(`Failed to append trade history: ${error}`);
        }
    }
    /**
     * Create a backup of the current state
     */
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path_1.default.join(this.dataDir, 'backups');
            // Ensure backup directory exists
            if (!fs_1.default.existsSync(backupDir)) {
                fs_1.default.mkdirSync(backupDir, { recursive: true });
            }
            // Create backup file paths
            const stateBackupFile = path_1.default.join(backupDir, `trading_state_${timestamp}.json`);
            const historyBackupFile = path_1.default.join(backupDir, `trade_history_${timestamp}.json`);
            // Copy files if they exist
            if (fs_1.default.existsSync(this.stateFile)) {
                await fs_1.default.promises.copyFile(this.stateFile, stateBackupFile);
            }
            if (fs_1.default.existsSync(this.tradeHistoryFile)) {
                await fs_1.default.promises.copyFile(this.tradeHistoryFile, historyBackupFile);
            }
            return backupDir;
        }
        catch (error) {
            console.error(`Failed to create backup: ${error}`);
            throw error;
        }
    }
    /**
     * Export trade history to CSV
     */
    async exportTradeHistoryToCsv(outputFile) {
        try {
            // Check if trade history exists
            if (!fs_1.default.existsSync(this.tradeHistoryFile)) {
                throw new Error(`No trade history file found: ${this.tradeHistoryFile}`);
            }
            // Read trade history
            const historyJson = await fs_1.default.promises.readFile(this.tradeHistoryFile, 'utf8');
            const history = JSON.parse(historyJson);
            // Create CSV header
            const headers = [
                'ID',
                'Token',
                'Type',
                'Price',
                'Quantity',
                'Timestamp',
                'Date',
                'Fees',
                'Total Cost',
                'Balance After'
            ];
            // Create CSV rows
            const rows = history.map(trade => [
                trade.id,
                trade.tokenMint,
                trade.orderType,
                trade.price,
                trade.quantity,
                trade.timestamp,
                new Date(trade.timestamp).toISOString(),
                trade.fees,
                trade.totalCost,
                trade.balanceAfterTrade
            ]);
            // Combine header and rows
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');
            // Write to output file
            await fs_1.default.promises.writeFile(outputFile, csvContent, 'utf8');
            return outputFile;
        }
        catch (error) {
            console.error(`Failed to export trade history: ${error}`);
            throw error;
        }
    }
    /**
     * Clear all trading data (use with caution!)
     */
    async clearAllData() {
        try {
            // Create backup before clearing
            await this.createBackup();
            // Delete state and history files
            if (fs_1.default.existsSync(this.stateFile)) {
                await fs_1.default.promises.unlink(this.stateFile);
            }
            if (fs_1.default.existsSync(this.tradeHistoryFile)) {
                await fs_1.default.promises.unlink(this.tradeHistoryFile);
            }
            console.log('All trading data cleared');
        }
        catch (error) {
            console.error(`Failed to clear trading data: ${error}`);
            throw error;
        }
    }
}
exports.PersistenceManager = PersistenceManager;
