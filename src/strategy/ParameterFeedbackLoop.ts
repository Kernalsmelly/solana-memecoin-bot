import EventEmitter from 'events';
import { readFileSync } from 'fs';
import path from 'path';

export interface ParamConfig {
  priceChangeThreshold: number;
  volumeMultiplier: number;
}

export interface ParameterUpdateEvent {
  newParams: ParamConfig;
  stats: SweepStats;
}

export interface SweepStats {
  trades: number;
  winRate: number;
  avgPnL: number;
  maxDrawdown: number;
}

export class ParameterFeedbackLoop extends EventEmitter {
  private tradeBuffer: any[] = [];
  private bufferSize: number;
  private sweepInterval: number;
  private currentParams: ParamConfig;
  private tradeLogPath: string;
  private tradeCount: number = 0;

  constructor(
    initialParams: ParamConfig,
    tradeLogPath: string,
    bufferSize = 25,
    sweepInterval = 5,
  ) {
    super();
    this.currentParams = initialParams;
    this.tradeLogPath = tradeLogPath;
    this.bufferSize = bufferSize;
    this.sweepInterval = sweepInterval;
  }

  public onTrade(trade: any) {
    this.tradeBuffer.push(trade);
    if (this.tradeBuffer.length > this.bufferSize) {
      this.tradeBuffer.shift();
    }
    this.tradeCount++;
    if (this.tradeCount % this.sweepInterval === 0) {
      this.runSweep();
    }
  }

  private runSweep() {
    // Sweep ±5% around current params
    const grid = this.generateParamGrid(this.currentParams);
    let bestStats: SweepStats | null = null;
    let bestParams: ParamConfig = this.currentParams;
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

  private generateParamGrid(params: ParamConfig): ParamConfig[] {
    const deltas = [0.95, 1, 1.05];
    const grid: ParamConfig[] = [];
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

  private evaluateParams(params: ParamConfig): SweepStats {
    // For now, use the last N trades in the buffer
    // In a real system, this would simulate or filter trades by params
    // Here, just compute stats on the buffer for demonstration
    const trades = this.tradeBuffer;
    let wins = 0,
      losses = 0,
      pnlSum = 0,
      maxDrawdown = 0,
      runningPnL = 0,
      peak = 0;
    for (const t of trades) {
      const pnl = parseFloat(t.pnl || '0');
      pnlSum += pnl;
      if (pnl > 0) wins++;
      else losses++;
      runningPnL += pnl;
      if (runningPnL > peak) peak = runningPnL;
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return {
      trades: trades.length,
      winRate: trades.length ? wins / trades.length : 0,
      avgPnL: trades.length ? pnlSum / trades.length : 0,
      maxDrawdown,
    };
  }

  public loadRecentTrades() {
    // Optionally load last N trades from CSV
    try {
      const csv = readFileSync(this.tradeLogPath, 'utf8');
      const lines = csv.trim().split('\n');
      if (!lines.length) throw new Error('No lines available');
      if (!lines[0]) throw new Error('No lines available');
      const header = lines[0].split(',');
      const trades = lines.slice(1).map((line) => {
        const parts = line.split(',');
        const obj: any = {};
        header.forEach((h, i) => (obj[h] = parts[i]));
        return obj;
      });
      this.tradeBuffer = trades.slice(-this.bufferSize);
    } catch (e) {
      // Ignore if file not found
    }
  }
}
