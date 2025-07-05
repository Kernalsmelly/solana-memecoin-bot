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
  async handleOHLCV(event: any) {
    const token = event.tokenSymbol || event.address;
    const now = Date.now() / 1000;
    if (this.cooldowns.get(token) && now < this.cooldowns.get(token)!) return;
    for (const name of this.enabled) {
      const strat = this.strategies.get(name);
      if (!strat) continue;
      await strat.handleOHLCV(event);
      // If a strategy triggers, set cooldown for this token
      // (Assume strategies emit 'patternMatch' on this coordinator)
      this.cooldowns.set(token, now + (strat.cooldownSec || this.defaultCooldownSec));
      break;
    }
  }
}

export default StrategyCoordinator;
