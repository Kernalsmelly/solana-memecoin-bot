import { EventEmitter } from 'events';
import logger from '../utils/logger';
import axios from 'axios';
import { mockPriceFeed } from '../utils/mockPriceFeed';

interface VolatilitySqueezeOptions {
  priceChangeThreshold: number;  // % change threshold
  volumeMultiplier: number;      // Volume multiplier for 1h SMA
  lookbackPeriodMs: number;      // Time window for price change
  checkIntervalMs: number;       // How often to check
}

export class VolatilitySqueeze extends EventEmitter {
  private options: VolatilitySqueezeOptions;
  private lastCheckTime: number;
  private interval: NodeJS.Timeout | null;

  constructor(options: Partial<VolatilitySqueezeOptions> = {}) {
    super();
    this.options = {
      priceChangeThreshold: options.priceChangeThreshold ?? 20,
      volumeMultiplier: options.volumeMultiplier ?? 2,
      lookbackPeriodMs: options.lookbackPeriodMs ?? 30 * 60 * 1000,
      checkIntervalMs: options.checkIntervalMs ?? 60 * 1000
    };
    this.lastCheckTime = Date.now();
    this.interval = null;
  }

  public start() {
    if (!this.interval) {
      this.interval = setInterval(() => this.check(), this.options.checkIntervalMs);
    }
  }

  public stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async check() {
    try {
      // Example: simulate a list of tokens (in real usage, get from discovery pipeline)
      const tokens = [
        { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana', decimals: 9 },
        { address: 'dummy', symbol: 'DUMMY', name: 'Dummy Token', decimals: 9 }
      ];

      for (const token of tokens) {
        let price = 0;
        let used = '';
        // Try Jupiter API for real price
        try {
          const resp = await axios.get(`https://quote-api.jup.ag/v6/price?ids=${token.address}`);
          if (resp.data && resp.data.data && resp.data.data[token.address]) {
            price = resp.data.data[token.address].price;
            used = 'jupiter';
          }
        } catch (e) {
          // Ignore and fall back
        }
        // Fallback to mock price feed
        if (!price) {
          price = mockPriceFeed.getPrice(token.address) || (0.00001 + Math.random() * 0.01);
          used = 'mock';
        }
        // Simulate price/volume history for squeeze detection
        const priceHistory = Array.from({ length: 20 }, () => price * (0.95 + Math.random() * 0.1));
        const volumeHistory = Array.from({ length: 20 }, () => Math.floor(1000 + Math.random() * 5000));
        logger.info(`[VolatilitySqueeze] Using ${used} price source for ${token.symbol}: $${price.toFixed(6)}`);
        // Emit a pattern match event as example
        this.emit('patternMatch', {
          token: { ...token, price },
          priceHistory,
          volumeHistory,
          suggestedPosition: 0
        });
      }
    } catch (err) {
      logger.error('VolatilitySqueeze check error', err);
    }
  }
}
