import { EventEmitter } from 'events';
import { analyzeMomentum } from './rocMomentum';
import { Strategy } from './strategyCoordinator';

export class MomentumBreakoutStrategy extends EventEmitter implements Strategy {
  public name = 'momentumBreakout';
  public enabled = true;
  public cooldownSec = 300;
  private priceHistory: Record<string, { prices: number[], maxLen: number }> = {};
  private maxHistory = 20;

  constructor(options: { cooldownSec?: number, maxHistory?: number } = {}) {
    super();
    if (options.cooldownSec) this.cooldownSec = options.cooldownSec;
    if (options.maxHistory) this.maxHistory = options.maxHistory;
  }

  async handleOHLCV(event: any): Promise<void> {
    const token = event.tokenSymbol || event.address;
    if (!token || typeof event.close !== 'number') return;
    if (!this.priceHistory[token]) {
      this.priceHistory[token] = { prices: [], maxLen: this.maxHistory };
    }
    const history = this.priceHistory[token];
    history.prices.push(event.close);
    if (history.prices.length > history.maxLen) history.prices.shift();
    if (history.prices.length < 5) return; // Not enough data
    const analysis = await analyzeMomentum(
      history.prices.map((price, i) => ({ timestamp: event.timestamp - (history.prices.length - i - 1) * 60000, price })),
      event.close
    );
    if (analysis.signal === 'BUY') {
      this.emit('patternMatch', {
        address: token,
        timestamp: event.timestamp,
        strategy: 'momentumBreakout',
        suggestedSOL: 1,
        details: analysis
      });
    }
  }
}

export default MomentumBreakoutStrategy;
