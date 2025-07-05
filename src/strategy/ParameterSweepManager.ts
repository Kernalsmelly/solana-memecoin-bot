import EventEmitter from 'events';

export interface SweepParams {
  priceChangeThreshold: number;
  volumeMultiplier: number;
}

export interface BatchPerformance {
  paramIndex: number;
  params: SweepParams;
  trades: number;
  totalPnL: number;
  sharpeLike: number;
}

/**
 * Manages parameter sweeps, batch assignment, and performance tracking
 */
export class ParameterSweepManager extends EventEmitter {
  private paramGrid: SweepParams[];
  private batchSize: number;
  private batchResults: BatchPerformance[] = [];
  private currentBatch: { paramIndex: number; trades: number; pnls: number[] };

  constructor(paramGrid: SweepParams[], batchSize = 5) {
    super();
    this.paramGrid = paramGrid;
    this.batchSize = batchSize;
    this.currentBatch = { paramIndex: 0, trades: 0, pnls: [] };
  }

  /** Get current parameters for the active batch */
  getCurrentParams(): SweepParams {
    return this.paramGrid[this.currentBatch.paramIndex];
  }

  /** Call after each trade to track PnL and maybe trigger batch rotation */
  recordTrade(pnl: number) {
    this.currentBatch.trades++;
    this.currentBatch.pnls.push(pnl);
    if (this.currentBatch.trades >= this.batchSize) {
      this.finishBatch();
      this.rotateParams();
    }
  }

  private finishBatch() {
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

  private rotateParams() {
    // Find best param set so far by Sharpe-like metric
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (const r of this.batchResults) {
      if (r.trades < this.batchSize) continue;
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
  getHistory(): BatchPerformance[] {
    return this.batchResults;
  }
}
