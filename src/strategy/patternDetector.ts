import { EventEmitter } from 'events';
import { TokenDiscovery } from '../discovery/tokenDiscovery';
import { RiskManager } from '../live/riskManager';
import { PatternType, PatternDetectorConfig, PatternCriteria, PatternMatch } from '../types';
export type { PatternMatch };

import logger from '../utils/logger';
import { tradeLogger } from '../utils/tradeLogger';

// Define DetectedPattern as an alias for PatternMatch if needed by other files

// export type DetectedPattern = PatternMatch;

import { calculatePositionSize } from '../utils/positionSizing';
import { AccountBalance } from '../positionManager';

/**
 * Pattern Detector System
 * Analyzes tokens for known trading patterns and generates signals
 */
export class PatternDetector extends EventEmitter {
  private tokenDiscovery: TokenDiscovery;
  private riskManager: RiskManager;
  private patternCriteria: Record<PatternType, PatternCriteria>;
  private maxTokenAge: number;
  private minLiquidity: number;
  private maxPositionValue: number;
  private enabledPatterns: PatternType[];
  
  constructor(config: PatternDetectorConfig) {
    super();
    this.tokenDiscovery = config.tokenDiscovery;
    this.riskManager = config.riskManager;
    this.maxTokenAge = config.maxTokenAge || 48; // 48 hours max age
    this.minLiquidity = config.minLiquidity || 50000; // $50K min liquidity
    this.maxPositionValue = config.maxPositionValue || 100; // $100 max position
    
    // Define criteria for pattern recognition - optimized based on performance metrics
    // Allow pattern criteria to be loaded from config or environment for hot-reload
    const customCriteria = (global as any).PATTERN_CRITERIA || {};
    this.patternCriteria = {
      'Mega Pump and Dump': customCriteria['Mega Pump and Dump'] || {
        priceChangeMin: 40,
        volumeChangeMin: 170,
        buyRatioMin: 2.5,
        liquidityMin: 50000,
        ageMax: 12
      },
      'Volatility Squeeze': customCriteria['Volatility Squeeze'] || {
        priceChangeMin: 20,
        volumeChangeMin: 100,
        buyRatioMin: 1.7,
        liquidityMin: 75000,
        ageMax: 24
      },
      'Smart Money Trap': customCriteria['Smart Money Trap'] || {
        priceChangeMin: 15,
        volumeChangeMin: 80,
        buyRatioMin: 1.8,
        liquidityMin: 90000,
        ageMax: 36
      },
      'Algorithmic Stop Hunt': customCriteria['Algorithmic Stop Hunt'] || {
        priceChangeMin: 25,
        volumeChangeMin: 120,
        buyRatioMin: 1.5,
        liquidityMin: 100000
      },
      'Smart Money Reversal': customCriteria['Smart Money Reversal'] || {
        priceChangeMin: 18,
        volumeChangeMin: 90,
        buyRatioMin: 1.6,
        liquidityMin: 85000
      },
      'Volume Divergence': customCriteria['Volume Divergence'] || {
        priceChangeMin: 12,
        volumeChangeMin: 80,
        buyRatioMin: 1.4,
        liquidityMin: 100000
      },
      'Hidden Accumulation': customCriteria['Hidden Accumulation'] || {
        priceChangeMin: 10,
        volumeChangeMin: 50,
        buyRatioMin: 1.3,
        liquidityMin: 120000
      },
      'Wyckoff Spring': customCriteria['Wyckoff Spring'] || {
        priceChangeMin: 15,
        volumeChangeMin: 60,
        buyRatioMin: 1.5,
        liquidityMin: 150000
      },
      'Liquidity Grab': customCriteria['Liquidity Grab'] || {
        priceChangeMin: 30,
        volumeChangeMin: 120,
        buyRatioMin: 1.6,
        liquidityMin: 80000
      },
      'FOMO Cycle': customCriteria['FOMO Cycle'] || {
        priceChangeMin: 35,
        volumeChangeMin: 150,
        buyRatioMin: 2.0,
        liquidityMin: 60000
      },
      // --- New Patterns ---
      'Volatility Breakout': customCriteria['Volatility Breakout'] || {
        priceChangeMin: 25, // Large price move in short time
        volumeChangeMin: 130, // Volume spike
        buyRatioMin: 1.8,
        liquidityMin: 70000,
        ageMax: 36
      },
      'Mean Reversion': customCriteria['Mean Reversion'] || {
        priceChangeMin: 10, // Modest move
        volumeChangeMin: 40, // Lower volume
        buyRatioMin: 1.0, // Neutral buy/sell
        liquidityMin: 50000,
        ageMax: 72
      }
    };
    if (Object.keys(customCriteria).length > 0) {
      logger.info('[PatternDetector] Loaded custom pattern thresholds from config/global.');
    }
    
    // Set enabled patterns (default to all if not specified)
    this.enabledPatterns = config.enabledPatterns || Object.keys(this.patternCriteria) as PatternType[];
    
    logger.info('Pattern Detector initialized', {
      enabledPatterns: this.enabledPatterns,
      maxTokenAge: this.maxTokenAge,
      minLiquidity: this.minLiquidity
    });
    
    // Set up event listeners for token discovery
    this.setupEventListeners();
  }
  
  /**
   * Set up event listeners for TokenDiscovery
   */
  private setupEventListeners(): void {
    // Listen for new tokens
    this.tokenDiscovery.on('newToken', this.analyzeTokenForPattern.bind(this));
    
    // Listen for volume spikes on existing tokens
    this.tokenDiscovery.on('volumeSpike', this.analyzeTokenForPattern.bind(this));
  }
  
  /**
   * Analyze token for trading patterns
   */
  public analyzeTokenForPattern(token: any): PatternMatch | null {
    logger.info('[DEBUG] analyzeTokenForPattern called', { token });
    tradeLogger.logScenario('PATTERN_ANALYSIS', {
      event: 'analyzeTokenForPattern',
      token: token.symbol || token.mint || token.address,
      timestamp: new Date().toISOString()
    });
    // Skip if token is too old or doesn't meet liquidity requirements
    try {
    if ((token.age && token.age > this.maxTokenAge)) {
      logger.info('[DEBUG] Token skipped due to age', { token, maxTokenAge: this.maxTokenAge });
      return null;
    }
    if ((token.liquidity && token.liquidity < this.minLiquidity)) {
      logger.info('[DEBUG] Token skipped due to liquidity', { token, minLiquidity: this.minLiquidity });
      return null;
    }
    // Analyze for patterns
    const patternMatch = this.analyzePatternMatch(token);
    if (patternMatch) {
      const { pattern, confidence, signalType } = patternMatch;
      // Calculate position size using new utility and risk/account state
      const rawBalance = this.riskManager.getAccountBalance ? this.riskManager.getAccountBalance() : { availableCash: 0, allocatedCash: 0, totalValue: 0 };
const accountBalance: AccountBalance = typeof rawBalance === 'object' && rawBalance !== null
  ? rawBalance
  : { availableCash: 0, allocatedCash: 0, totalValue: 0 };

      const positionSize = calculatePositionSize(token, this.riskManager, accountBalance);
      logger.info('[DEBUG] Calculated position size', { token: token.symbol, positionSize });
      if (positionSize > 0 && this.riskManager.canOpenPosition(positionSize, token.symbol, token.price)) {
        logger.info('[DEBUG] Pattern matched and can open position', { token, pattern, confidence, positionSize });
        // Emit pattern detected event
        this.emit('patternDetected', {
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          pattern,
          confidence,
          signalType
        });
        logger.info('[DEBUG] patternDetected event emitted', { token, pattern, confidence, positionSize });
        return patternMatch;
      } else {
        logger.info('[DEBUG] Pattern matched but cannot open position or size is zero', { token, pattern, confidence, positionSize });
      }
    } else {
      logger.info('[DEBUG] No pattern matched for token', { token });
    }
    return null;
  } catch (error) {
    logger.error('[PatternDetector] Error in analyzeTokenForPattern', { error });
    return null;
  }
  }

  private analyzePatternMatch(token: any): PatternMatch | null {
    // Skip tokens with insufficient data
    if (!token || !token.price || !token.priceChange24h) {
      return null;
    }
    
    let bestMatch: PatternMatch | null = null;
    let highestConfidence = 0;

    // --- Volatility Squeeze Utility ---
    function detectVolatilitySqueeze(prices: number[], currentPrice?: number): { isSqueeze: boolean, breakout: boolean, squeezeStrength: number, bandWidth: number } {
      // Calculate Bollinger Bands (20 period, 2 stddev)
      const period = 20;
      if (prices.length < period) return { isSqueeze: false, breakout: false, squeezeStrength: 0, bandWidth: 0 };
      const slice = prices.slice(-period);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
      const upper = mean + 2 * std;
      const lower = mean - 2 * std;
      const bandWidth = (upper - lower) / mean;
      // Squeeze: bandWidth is very low (e.g. < 0.06 for functional testing)
      const isSqueeze = bandWidth < 0.06;
      // Breakout: use currentPrice if provided, else last price in history
      const breakout = (typeof currentPrice === 'number' ? currentPrice : prices[prices.length - 1]) > upper;
      // Squeeze strength: inverse of bandWidth
      const squeezeStrength = Math.min(1, 0.06 / (bandWidth + 1e-8));
      return { isSqueeze, breakout, squeezeStrength, bandWidth };
    }

    // Check each pattern
    for (const pattern of this.enabledPatterns) {
      const criteria = this.patternCriteria[pattern];
      // Skip if token age exceeds pattern's max age
      if (criteria.ageMax && token.age > criteria.ageMax) {
        continue;
      }
      // Skip if liquidity is too low
      if (token.liquidity < criteria.liquidityMin) {
        continue;
      }
      // --- Volatility Squeeze Logic ---
      if (pattern === 'Volatility Squeeze' && Array.isArray(token.priceHistory) && token.priceHistory.length >= 20) {
        const { isSqueeze, breakout, squeezeStrength, bandWidth } = detectVolatilitySqueeze(token.priceHistory, token.price);
        if (isSqueeze && breakout) {
          const confidence = Math.round(80 + squeezeStrength * 20); // 80-100% confidence
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            bestMatch = {
              pattern,
              confidence,
              signalType: 'buy',
              meta: { squeezeStrength, bandWidth }
            };
          }
          continue;
        }
      }
      // --- Other Patterns (default logic) ---
      const priceChangeScore = Math.min(100, Math.max(0, ((token.priceChange24h || 0) / (criteria.priceChangeMin || 1)) * 100));
      const volumeChangeScore = Math.min(100, Math.max(0, ((token.volumeChange24h || 0) / (criteria.volumeChangeMin || 1)) * 100));
      const buyRatioScore = Math.min(100, Math.max(0, ((token.buyRatio || 0) / (criteria.buyRatioMin || 1)) * 100));
      const liquidityScore = Math.min(100, Math.max(0, ((token.liquidity || 0) / (criteria.liquidityMin || 1)) * 100));
      // Weight the scores based on importance
      const confidence = Math.round(
        (priceChangeScore * 0.4) + 
        (volumeChangeScore * 0.3) + 
        (buyRatioScore * 0.2) + 
        (liquidityScore * 0.1)
      );
      // If this pattern has higher confidence, make it the best match
      if (confidence > highestConfidence && confidence >= 70) { // Minimum 70% confidence
        highestConfidence = confidence;
        bestMatch = {
          pattern,
          confidence,
          signalType: 'buy' // Default to buy signals
        };
      }
    }
    return bestMatch;
  }
  
  /**
   * Start pattern detection
   */
  public start(): Promise<boolean> {
    // Start token discovery
    return this.tokenDiscovery.start();
  }
  
  /**
   * Stop pattern detection
   */
  public stop(): void {
    // Remove all event listeners
    this.removeAllListeners();
    
    // Stop token discovery
    this.tokenDiscovery.stop();
    
    logger.info('Pattern Detector stopped');
  }
}
