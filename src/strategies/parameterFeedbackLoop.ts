import { VolatilitySqueeze } from './volatilitySqueeze.js';

export interface FeedbackTrade {
  priceChangeThreshold: number;
  volumeMultiplier: number;
  pnl: number;
  win: boolean;
  drawdown: number;
  fees: number;
  slippage: number;
}

export interface FeedbackParams {
  priceChangeThreshold: number;
  volumeMultiplier: number;
}

export interface FeedbackStats {
  tradeCount: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
}

export class ParameterFeedbackLoop {
  private batchSize: number;
  private deltaPct: number;
  private tradeBuffer: FeedbackTrade[] = [];
  private lastParams: FeedbackParams;
  private onUpdate: (params: FeedbackParams, stats: FeedbackStats) => void;

  constructor(
    initialParams: FeedbackParams,
    onUpdate: (params: FeedbackParams, stats: FeedbackStats) => void,
    batchSize = 5,
    deltaPct = 0.05,
  ) {
    this.lastParams = initialParams;
    this.onUpdate = onUpdate;
    this.batchSize = batchSize;
    this.deltaPct = deltaPct;
  }

  addTrade(trade: FeedbackTrade) {
    this.tradeBuffer.push(trade);
    if (this.tradeBuffer.length >= this.batchSize) {
      this.runSweep();
      this.tradeBuffer = [];
    }
  }

  private runSweep() {
    const { priceChangeThreshold, volumeMultiplier } = this.lastParams;
    const grid = [
      ...[-this.deltaPct, 0, this.deltaPct].map((d) => ({
        priceChangeThreshold: priceChangeThreshold * (1 + d),
        volumeMultiplier: volumeMultiplier * (1 + d),
      })),
    ];
    let best: { params: FeedbackParams; stats: FeedbackStats } | null = null;
    for (const params of grid) {
      const stats = this.simulate(params);
      if (
        !best ||
        stats.netPnl > best.stats.netPnl ||
        (stats.netPnl === best.stats.netPnl && stats.winRate > best.stats.winRate)
      ) {
        best = { params, stats };
      }
    }
    if (best) {
      this.lastParams = best.params;
      this.onUpdate(best.params, best.stats);
    }
  }

  private simulate(params: FeedbackParams): FeedbackStats {
    // For demo, just use the batch as-is; in production, would replay logic
    let netPnl = 0,
      wins = 0,
      losses = 0,
      maxDrawdown = 0,
      runningPnL = 0,
      peakPnL = 0;
    for (const t of this.tradeBuffer) {
      netPnl += t.pnl;
      if (t.win) wins++;
      else losses++;
      runningPnL += t.pnl;
      if (runningPnL > peakPnL) peakPnL = runningPnL;
      const drawdown = peakPnL > 0 ? (100 * (runningPnL - peakPnL)) / peakPnL : 0;
      if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    }
    return {
      tradeCount: this.tradeBuffer.length,
      winRate: this.tradeBuffer.length ? wins / this.tradeBuffer.length : 0,
      netPnl,
      maxDrawdown,
    };
  }
}
