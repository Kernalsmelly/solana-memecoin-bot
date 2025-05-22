import { EventEmitter } from 'events';
import { TokenDiscovery } from '../discovery/tokenDiscovery';
import { RiskManager } from '../live/riskManager';
import { PatternType } from '../types';
import logger from '../utils/logger';

export interface PatternDetectorConfig {
  tokenDiscovery: TokenDiscovery;
  riskManager: RiskManager;
  maxTokenAge?: number; // in hours
  minLiquidity?: number; // in USD
  maxPositionValue?: number; // in USD
  enabledPatterns?: PatternType[];
}

export interface PatternCriteria {
  priceChangeMin: number; // Minimum price change percentage
  volumeChangeMin: number; // Minimum volume change percentage
  buyRatioMin: number; // Minimum buy/sell ratio
  liquidityMin: number; // Minimum liquidity in USD
  ageMax?: number; // Maximum token age in hours
  holdersMin?: number; // Minimum number of holders
}

export interface PatternMatch {
  pattern: PatternType;
  confidence: number; // 0-100
  signalType: 'buy' | 'sell';
}

// Define DetectedPattern as an alias for PatternMatch if needed by other files
// export type DetectedPattern = PatternMatch;

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
    this.patternCriteria = {
      'Mega Pump and Dump': {
        // Achieved 187.5% returns with 65.2% drawdown
        priceChangeMin: 40, // Higher threshold for price movement
        volumeChangeMin: 170, // Strong volume increase
        buyRatioMin: 2.5, // Heavy buying pressure
        liquidityMin: 50000, // Ensure sufficient liquidity
        ageMax: 12 // Focus on newer tokens
      },
      'Volatility Squeeze': {
        // Achieved 75.9% returns with 43.2% drawdown
        priceChangeMin: 20,
        volumeChangeMin: 100,
        buyRatioMin: 1.7,
        liquidityMin: 75000,
        ageMax: 24 // Slightly older tokens can work for this pattern
      },
      'Smart Money Trap': {
        // Achieved 66.8% returns with 40.0% drawdown
        priceChangeMin: 15,
        volumeChangeMin: 80,
        buyRatioMin: 1.8,
        liquidityMin: 90000,
        ageMax: 36
      },
      'Algorithmic Stop Hunt': {
        // Achieved 61.0% returns with 37.9% drawdown
        priceChangeMin: 25,
        volumeChangeMin: 120,
        buyRatioMin: 1.5,
        liquidityMin: 100000
      },
      'Smart Money Reversal': {
        // Achieved 55.3% returns with 35.6% drawdown
        priceChangeMin: 18,
        volumeChangeMin: 90,
        buyRatioMin: 1.6,
        liquidityMin: 85000
      },
      'Volume Divergence': {
        priceChangeMin: 12,
        volumeChangeMin: 80,
        buyRatioMin: 1.4,
        liquidityMin: 100000
      },
      'Hidden Accumulation': {
        priceChangeMin: 10,
        volumeChangeMin: 50,
        buyRatioMin: 1.3,
        liquidityMin: 120000
      },
      'Wyckoff Spring': {
        priceChangeMin: 15,
        volumeChangeMin: 60,
        buyRatioMin: 1.5,
        liquidityMin: 150000
      },
      'Liquidity Grab': {
        priceChangeMin: 30,
        volumeChangeMin: 120,
        buyRatioMin: 1.6,
        liquidityMin: 80000
      },
      'FOMO Cycle': {
        priceChangeMin: 35,
        volumeChangeMin: 150,
        buyRatioMin: 2.0,
        liquidityMin: 60000
      }
    };
    
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
    // Skip if token is too old or doesn't meet liquidity requirements
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
      // Calculate position size based on risk parameters
      const positionSize = this.calculatePositionSize(token.price);
      // Check if we can open a position
      if (this.riskManager.canOpenPosition(positionSize, token.symbol, token.price)) {
        logger.info('[DEBUG] Pattern matched and can open position', { token, pattern, confidence, positionSize });
        // Emit pattern detected event
        this.emit('patternDetected', {
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          pattern,
          confidence,
          signalType,
          price: token.price,
          positionSize,
          timestamp: Date.now()
        });
        logger.info('[DEBUG] patternDetected event emitted', { token, pattern, confidence, positionSize });
        return patternMatch;
      } else {
        logger.info('[DEBUG] Pattern matched but cannot open position', { token, pattern, confidence, positionSize });
      }
    } else {
      logger.info('[DEBUG] No pattern matched for token', { token });
    }
    return null;
  }
  
  /**
   * Analyze token metrics to detect patterns
   */
  private analyzePatternMatch(token: any): PatternMatch | null {
    // Skip tokens with insufficient data
    if (!token || !token.price || !token.priceChange24h) {
      return null;
    }
    
    let bestMatch: PatternMatch | null = null;
    let highestConfidence = 0;
    
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
      
      // Calculate confidence score (0-100)
      const priceChangeScore = Math.min(token.priceChange24h / criteria.priceChangeMin, 2) * 25;
      const volumeChangeScore = Math.min(token.volumeChange24h / criteria.volumeChangeMin, 2) * 25;
      const buyRatioScore = Math.min(token.buyRatio / criteria.buyRatioMin, 2) * 25;
      const liquidityScore = Math.min(token.liquidity / criteria.liquidityMin, 2) * 25;
      
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
   * Calculate position size based on token price and risk parameters
   */
  public calculatePositionSize(tokenPrice: number): number {
    // Get max position value from risk manager
    const maxPositionValue = this.riskManager.getMaxPositionValueUsd();
    
    // Calculate tokens to buy (maxPositionValue / tokenPrice)
    const positionSize = maxPositionValue / tokenPrice;
    
    return positionSize;
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
