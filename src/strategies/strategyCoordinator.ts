import EventEmitter from 'events';

export interface Strategy {
  name: string;
  enabled: boolean;
  cooldownSec: number;
  handleOHLCV(event: any): Promise<void>;
}

interface CoordinatorOptions {
  strategies: Strategy[];
  cooldownSec?: number;
  enabledStrategies?: string[];
  stratWeightsInterval?: number;
}

export class StrategyCoordinator extends EventEmitter {
  private strategies: Map<string, Strategy>;
  private cooldowns: Map<string, number>; // tokenSymbol => timestamp
  private enabled: Set<string>;
  private defaultCooldownSec: number;

  constructor(options: CoordinatorOptions) {
    super();
    this.strategies = new Map();
    (options.strategies || []).forEach(s => this.strategies.set(s.name, s));
    this.enabled = new Set(options.enabledStrategies || process.env.ENABLED_STRATEGIES?.split(',') || [...this.strategies.keys()]);
    this.cooldowns = new Map();
    this.defaultCooldownSec = options.cooldownSec || 300;
    this.stratWeightsInterval = options.stratWeightsInterval || Number(process.env.STRAT_WEIGHTS_INTERVAL) || 10;
    // Start periodic weight update
    this.weightUpdateTimer = setInterval(() => this.updateStrategyWeights(), 60 * 1000); // every 1min
  }

  enableStrategy(name: string, enabled: boolean) {
    if (enabled) this.enabled.add(name);
    else this.enabled.delete(name);
  }

  getEnabledStrategies(): string[] {
    return Array.from(this.enabled);
  }

  /**
   * Called on every new OHLCV event. Schedules enabled strategies in order.
   */
  // Store per-strategy weights (default 1.0)
  private strategyWeights: Map<string, number> = new Map();
  private strategyTradeHistory: Map<string, { pnl: number, win: boolean, timestamp: number }[]> = new Map();
  private stratWeightsInterval: number;
  private weightUpdateTimer: NodeJS.Timeout | null = null;

  async handleOHLCV(event: any) {
    const token = event.tokenSymbol || event.address;
    const now = Date.now() / 1000;
    if (this.cooldowns.get(token) && now < this.cooldowns.get(token)!) return;
    // Allow all enabled strategies to process the event concurrently
    await Promise.all(Array.from(this.enabled).map(async name => {
      const strat = this.strategies.get(name);
      if (!strat) return;
      await strat.handleOHLCV(event);
      // If a strategy triggers, set cooldown for this token (handled by patternMatch event in orchestration layer)
      // For now, set cooldown for all strategies
      this.cooldowns.set(token, now + (strat.cooldownSec || this.defaultCooldownSec));
    }));
  }

  setStrategyWeight(name: string, weight: number) {
    this.strategyWeights.set(name, weight);
  }

  getStrategyWeight(name: string): number {
    return this.strategyWeights.get(name) || 1.0;
  }

  recordTrade(strategy: string, pnl: number, win: boolean) {
    if (!this.strategyTradeHistory.has(strategy)) this.strategyTradeHistory.set(strategy, []);
    const arr = this.strategyTradeHistory.get(strategy)!;
    arr.push({ pnl, win, timestamp: Date.now() });
    // Keep only last stratWeightsInterval trades
    if (arr.length > this.stratWeightsInterval) arr.shift();
  }

  getRecentStats(strategy: string) {
    const arr = this.strategyTradeHistory.get(strategy) || [];
    const n = arr.length;
    if (n === 0) return { roi: 0, volatility: 1, winRate: 0 };
    const sumPnl = arr.reduce((a, b) => a + b.pnl, 0);
    const mean = sumPnl / n;
    const variance = arr.reduce((a, b) => a + Math.pow(b.pnl - mean, 2), 0) / (n || 1);
    const volatility = Math.sqrt(variance) || 1;
    const roi = mean;
    const winRate = arr.filter(t => t.win).length / n;
    return { roi, volatility, winRate };
  }

  updateStrategyWeights() {
    // Weight ∝ ROI / volatility
    for (const name of this.strategies.keys()) {
      const { roi, volatility } = this.getRecentStats(name);
      const weight = volatility > 0 ? Math.max(roi / volatility, 0.01) : 0.01;
      this.setStrategyWeight(name, weight);
    }
  }

  // Weighted round-robin scheduling stub (to be implemented in trade dispatch logic)
  getWeightedStrategyOrder(): string[] {
    // Return strategies ordered by weight (highest first)
    return Array.from(this.enabled).sort((a, b) => this.getStrategyWeight(b) - this.getStrategyWeight(a));
  }
}

export default StrategyCoordinator;
