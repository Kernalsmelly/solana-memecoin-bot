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
import dotenv from 'dotenv';
dotenv.config();

export class ParameterSweepManager extends EventEmitter {
  /**
   * Runs a full parameter sweep using sweep ranges from .env, simulates trades, and returns the best params.
   * @param tradesCount Number of trades per combo
   * @param simulate Callback to simulate trades for given params (returns array of PnLs)
   */
  static async runSweepFromEnv(
    tradesCount: number,
    simulate: (params: SweepParams, n: number) => Promise<number[]>,
  ): Promise<{
    bestParams: SweepParams;
    bestStats: BatchPerformance;
    allResults: BatchPerformance[];
  }> {
    const stopLossRange = (process.env.SWEEP_STOP_LOSS_RANGE || '')
      .split(',')
      .map(Number)
      .filter((x) => !isNaN(x));
    const takeProfitRange = (process.env.SWEEP_TAKE_PROFIT_RANGE || '')
      .split(',')
      .map(Number)
      .filter((x) => !isNaN(x));
    const riskPctRange = (process.env.SWEEP_RISK_PCT_RANGE || '')
      .split(',')
      .map(Number)
      .filter((x) => !isNaN(x));
    if (!stopLossRange.length || !takeProfitRange.length || !riskPctRange.length) {
      throw new Error('Sweep ranges missing or invalid in .env');
    }
    // Generate grid
    const paramGrid: SweepParams[] = [];
    for (const stopLoss of stopLossRange) {
      for (const takeProfit of takeProfitRange) {
        for (const riskPct of riskPctRange) {
          paramGrid.push({
            stopLossPct: stopLoss,
            takeProfitPct: takeProfit,
            riskPct: riskPct,
          } as any);
        }
      }
    }
    // Run sweep
    const batchResults: BatchPerformance[] = [];
    for (let i = 0; i < paramGrid.length; ++i) {
      const params = paramGrid[i];
      if (!params) continue; // Skip undefined params
      const pnls = await simulate(params, tradesCount);
      const trades = pnls.length;
      const totalPnL = pnls.reduce((a, b) => a + b, 0);
      const stdDev = Math.sqrt(
        pnls.reduce((a, b) => a + Math.pow(b - totalPnL / trades, 2), 0) / (trades || 1),
      );
      const sharpeLike = stdDev ? totalPnL / stdDev : totalPnL;
      batchResults.push({
        paramIndex: i,
        params: params,
        trades,
        totalPnL,
        sharpeLike,
      });
    }
    // Pick best by netPnL (or Sharpe-like if desired)
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < batchResults.length; ++i) {
      const score = batchResults[i]?.totalPnL ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const bestParams = paramGrid[bestIdx];
    const bestStats = batchResults[bestIdx];
    if (!bestParams || !bestStats) {
      throw new Error('Best parameter index out of bounds or no results available.');
    }
    return {
      bestParams,
      bestStats,
      allResults: batchResults,
    };
  }

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
    const params = this.paramGrid[this.currentBatch.paramIndex];
    if (!params) throw new Error('Current batch parameter index out of bounds.');
    return params;
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
    const stdDev = Math.sqrt(
      pnls.reduce((a, b) => a + Math.pow(b - totalPnL / trades, 2), 0) / (trades || 1),
    );
    const sharpeLike = stdDev ? totalPnL / stdDev : totalPnL;
    const params = this.paramGrid[paramIndex];
    if (!params) return; // Skip undefined params
    this.batchResults.push({
      paramIndex,
      params,
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
