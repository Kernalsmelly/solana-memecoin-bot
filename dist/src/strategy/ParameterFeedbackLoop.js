"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParameterFeedbackLoop = void 0;
const events_1 = __importDefault(require("events"));
const fs_1 = require("fs");
class ParameterFeedbackLoop extends events_1.default {
    tradeBuffer = [];
    bufferSize;
    sweepInterval;
    currentParams;
    tradeLogPath;
    tradeCount = 0;
    constructor(initialParams, tradeLogPath, bufferSize = 25, sweepInterval = 5) {
        super();
        this.currentParams = initialParams;
        this.tradeLogPath = tradeLogPath;
        this.bufferSize = bufferSize;
        this.sweepInterval = sweepInterval;
    }
    onTrade(trade) {
        this.tradeBuffer.push(trade);
        if (this.tradeBuffer.length > this.bufferSize) {
            this.tradeBuffer.shift();
        }
        this.tradeCount++;
        if (this.tradeCount % this.sweepInterval === 0) {
            this.runSweep();
        }
    }
    runSweep() {
        // Sweep ±5% around current params
        const grid = this.generateParamGrid(this.currentParams);
        let bestStats = null;
        let bestParams = this.currentParams;
        for (const params of grid) {
            const stats = this.evaluateParams(params);
            if (!bestStats || stats.avgPnL > bestStats.avgPnL) {
                bestStats = stats;
                bestParams = params;
            }
        }
        // Emit event and update current params
        this.currentParams = bestParams;
        this.emit('ParameterUpdateEvent', { newParams: bestParams, stats: bestStats });
    }
    generateParamGrid(params) {
        const deltas = [0.95, 1, 1.05];
        const grid = [];
        for (const dPrice of deltas) {
            for (const dVol of deltas) {
                grid.push({
                    priceChangeThreshold: params.priceChangeThreshold * dPrice,
                    volumeMultiplier: params.volumeMultiplier * dVol,
                });
            }
        }
        return grid;
    }
    evaluateParams(params) {
        // For now, use the last N trades in the buffer
        // In a real system, this would simulate or filter trades by params
        // Here, just compute stats on the buffer for demonstration
        const trades = this.tradeBuffer;
        let wins = 0, losses = 0, pnlSum = 0, maxDrawdown = 0, runningPnL = 0, peak = 0;
        for (const t of trades) {
            const pnl = parseFloat(t.pnl || '0');
            pnlSum += pnl;
            if (pnl > 0)
                wins++;
            else
                losses++;
            runningPnL += pnl;
            if (runningPnL > peak)
                peak = runningPnL;
            const drawdown = peak - runningPnL;
            if (drawdown > maxDrawdown)
                maxDrawdown = drawdown;
        }
        return {
            trades: trades.length,
            winRate: trades.length ? wins / trades.length : 0,
            avgPnL: trades.length ? pnlSum / trades.length : 0,
            maxDrawdown,
        };
    }
    loadRecentTrades() {
        // Optionally load last N trades from CSV
        try {
            const csv = (0, fs_1.readFileSync)(this.tradeLogPath, 'utf8');
            const lines = csv.trim().split('\n');
            const header = lines[0].split(',');
            const trades = lines.slice(1).map(line => {
                const parts = line.split(',');
                const obj = {};
                header.forEach((h, i) => obj[h] = parts[i]);
                return obj;
            });
            this.tradeBuffer = trades.slice(-this.bufferSize);
        }
        catch (e) {
            // Ignore if file not found
        }
    }
}
exports.ParameterFeedbackLoop = ParameterFeedbackLoop;
//# sourceMappingURL=ParameterFeedbackLoop.js.map