"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParameterSweepManager = void 0;
const events_1 = __importDefault(require("events"));
/**
 * Manages parameter sweeps, batch assignment, and performance tracking
 */
class ParameterSweepManager extends events_1.default {
    paramGrid;
    batchSize;
    batchResults = [];
    currentBatch;
    constructor(paramGrid, batchSize = 5) {
        super();
        this.paramGrid = paramGrid;
        this.batchSize = batchSize;
        this.currentBatch = { paramIndex: 0, trades: 0, pnls: [] };
    }
    /** Get current parameters for the active batch */
    getCurrentParams() {
        return this.paramGrid[this.currentBatch.paramIndex];
    }
    /** Call after each trade to track PnL and maybe trigger batch rotation */
    recordTrade(pnl) {
        this.currentBatch.trades++;
        this.currentBatch.pnls.push(pnl);
        if (this.currentBatch.trades >= this.batchSize) {
            this.finishBatch();
            this.rotateParams();
        }
    }
    finishBatch() {
        const { paramIndex, pnls } = this.currentBatch;
        const trades = pnls.length;
        const totalPnL = pnls.reduce((a, b) => a + b, 0);
        const stdDev = Math.sqrt(pnls.reduce((a, b) => a + Math.pow(b - totalPnL / trades, 2), 0) / (trades || 1));
        const sharpeLike = stdDev ? totalPnL / stdDev : totalPnL;
        this.batchResults.push({
            paramIndex,
            params: this.paramGrid[paramIndex],
            trades,
            totalPnL,
            sharpeLike,
        });
    }
    rotateParams() {
        // Find best param set so far by Sharpe-like metric
        let bestIdx = 0;
        let bestScore = -Infinity;
        for (const r of this.batchResults) {
            if (r.trades < this.batchSize)
                continue;
            if (r.sharpeLike > bestScore) {
                bestScore = r.sharpeLike;
                bestIdx = r.paramIndex;
            }
        }
        // Next batch: use best so far, or next in grid if all equal
        const nextIdx = bestIdx;
        const prevIdx = this.currentBatch.paramIndex;
        this.currentBatch = { paramIndex: nextIdx, trades: 0, pnls: [] };
        if (nextIdx !== prevIdx) {
            this.emit('ParameterUpdateEvent', this.paramGrid[nextIdx]);
        }
    }
    /** For reporting */
    getHistory() {
        return this.batchResults;
    }
}
exports.ParameterSweepManager = ParameterSweepManager;
//# sourceMappingURL=ParameterSweepManager.js.map