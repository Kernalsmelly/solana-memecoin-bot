import { EventEmitter } from 'events';
import { analyzeMomentum } from './rocMomentum';
import { Strategy } from './strategyCoordinator';

import { Strategy } from '../strategy/StrategyCoordinator';

export class MomentumBreakoutStrategy extends EventEmitter implements Strategy {
  public name = 'momentumBreakout';
  public enabled = true;
  public cooldownSec = 300;
  private priceHistory: Record<string, { prices: { price: number, timestamp: number }[], maxLen: number }> = {};
  private maxHistory = 120; // 120 minutes for 1h+ buffer
  private momentumThreshold: number;
  private rollingWindowMs: number = 60 * 60 * 1000; // 1 hour

  constructor(options: { cooldownSec?: number, maxHistory?: number, momentumThreshold?: number } = {}) {
    super();
    if (options.cooldownSec) this.cooldownSec = options.cooldownSec;
    if (options.maxHistory) this.maxHistory = options.maxHistory;
    this.momentumThreshold = typeof options.momentumThreshold === 'number'
      ? options.momentumThreshold
      : (Number(process.env.MOMENTUM_THRESHOLD) || 1.0); // default 1%
  }
    super();
    if (options.cooldownSec) this.cooldownSec = options.cooldownSec;
    if (options.maxHistory) this.maxHistory = options.maxHistory;
  }

  async handleOHLCV(event: any): Promise<void> {
    const token = event.tokenSymbol || event.address;
    if (!token || typeof event.close !== 'number' || typeof event.timestamp !== 'number') return;
    if (!this.priceHistory[token]) {
      this.priceHistory[token] = { prices: [], maxLen: this.maxHistory };
    }
    const history = this.priceHistory[token];
    history.prices.push({ price: event.close, timestamp: event.timestamp });
    if (history.prices.length > history.maxLen) history.prices.shift();
    // 1h rolling high: filter for last 60m
    const cutoff = event.timestamp - this.rollingWindowMs;
    const windowPrices = history.prices.filter(p => p.timestamp >= cutoff);
    if (windowPrices.length < 5) return; // Not enough data
    const high = Math.max(...windowPrices.map(p => p.price));
    const threshold = high * (1 + this.momentumThreshold / 100);
    if (event.close >= threshold) {
      this.emit('patternMatch', {
        address: token,
        timestamp: event.timestamp,
        strategy: 'momentumBreakout',
        suggestedSOL: 1,
        details: {
          close: event.close,
          high,
          momentumThreshold: this.momentumThreshold,
          percentAboveHigh: ((event.close - high) / high) * 100
        }
      });
    }
  }
  // Implement the required execute method for Strategy interface
  public async execute(token: string): Promise<void> {
    // In a real implementation, fetch OHLCV data and call handleOHLCV
    // For now, just log or call handleOHLCV with a stub event
    console.log(`[MomentumBreakoutStrategy] Executing strategy for token: ${token}`);
    // Optionally: await this.handleOHLCV({ tokenSymbol: token, timestamp: Date.now(), close: 0 });
  }
}

export default MomentumBreakoutStrategy;
