import { EventEmitter } from 'events';
import { TokenAnalyzer } from '../analysis/tokenAnalyzer';
import { BirdeyeTokenData } from '../analysis/types';
import logger from '../utils/logger';
import { globalRateLimiter } from '../utils/rateLimiter';

interface VolatilitySqueezeOptions {
  priceChangeThreshold: number;  // % change threshold
  volumeMultiplier: number;      // Volume multiplier for 1h SMA
  lookbackPeriodMs: number;      // Time window for price change
  checkIntervalMs: number;       // How often to check
}

export class VolatilitySqueeze extends EventEmitter {
  private tokenAnalyzer: TokenAnalyzer;
  private rateLimiter: RateLimiter;
  private options: VolatilitySqueezeOptions;
  private lastCheckTime: number;

  constructor(options: Partial<VolatilitySqueezeOptions> = {}) {
    super();
    this.tokenAnalyzer = new TokenAnalyzer();
    this.rateLimiter = globalRateLimiter;
    
    this.options = {
      priceChangeThreshold: options.priceChangeThreshold || 20,  // 20% default
      volumeMultiplier: options.volumeMultiplier || 2,           // 2x 1h SMA default
      lookbackPeriodMs: options.lookbackPeriodMs || 30 * 60 * 1000, // 30 min
      checkIntervalMs: options.checkIntervalMs || 60 * 1000      // 1 min
    };
    
    this.lastCheckTime = Date.now();
  }

  public async start(): Promise<void> {
    // Start checking for patterns
    setInterval(async () => {
      await this.checkForSqueeze();
    }, this.options.checkIntervalMs);
  }

  private async checkForSqueeze(): Promise<void> {
    // Rate limit check
    if (!await this.rateLimiter.canMakeRequest('birdeye')) {
      return;
    }

    try {
      // Get recent token data
      const recentTokens = await this.tokenAnalyzer.getRecentTokens();
      
      for (const token of recentTokens) {
        const isSqueeze = await this.detectSqueeze(token);
        if (isSqueeze) {
          this.emit('patternMatch', {
            token,
            pattern: 'volatilitySqueeze',
            suggestedPosition: 1 // Placeholder for position sizing
          });
        }
      }
    } catch (error) {
      logger.error('Error in volatility squeeze detection:', error);
    }
  }

  private async detectSqueeze(token: BirdeyeTokenData): Promise<boolean> {
    // Get historical price data
    const history = await this.tokenAnalyzer.getPriceHistory(token.address, this.options.lookbackPeriodMs);
    
    if (!history || history.length < 2) {
      return false;
    }

    // Calculate price change
    const latestPrice = history[0].price;
    const oldestPrice = history[history.length - 1].price;
    const priceChange = ((latestPrice - oldestPrice) / oldestPrice) * 100;

    // Calculate volume metrics
    const currentVolume = history[0].volume;
    const oneHourVolume = history
      .slice(0, Math.floor(this.options.lookbackPeriodMs / (60 * 1000)))
      .reduce((sum, entry) => sum + entry.volume, 0) / history.length;

    // Check conditions
    const priceCondition = Math.abs(priceChange) >= this.options.priceChangeThreshold;
    const volumeCondition = currentVolume >= (oneHourVolume * this.options.volumeMultiplier);

    return priceCondition && volumeCondition;
  }

  public stop(): void {
    // Cleanup any intervals
  }
}
