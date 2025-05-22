import { Connection, PublicKey } from '@solana/web3.js';
import { PatternDetector, PatternMatch } from '../strategy/patternDetector';
import { PatternType } from '../types';
import logger from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface BacktestConfig {
  tokenAddress: string;
  startTimestamp: number;
  endTimestamp: number;
  patternTypes?: PatternType[];
  connection: Connection;
  priceDataPath?: string;
  saveResults?: boolean;
}

interface PriceDataPoint {
  timestamp: number;
  price: number;
  volume: number;
  liquidity: number;
  buys: number;
  sells: number;
}

interface PatternBacktestResult {
  patternName: PatternType;
  detectionCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgReturn: number;
  maxReturn: number;
  maxDrawdown: number;
  avgHoldingTimeHours: number;
  profitFactor: number;
  trades: {
    timestamp: number;
    entryPrice: number;
    exitPrice: number;
    holdingTimeHours: number;
    pnlPercent: number;
    exitReason: string;
  }[];
}

/**
 * Pattern Backtester
 * Tests pattern detection strategies against historical price data
 */
export class PatternBacktester {
  private config: BacktestConfig;
  private priceData: PriceDataPoint[] = [];
  private patternDetector: PatternDetector | null = null; 
  private results: Record<PatternType, PatternBacktestResult> = {} as Record<PatternType, PatternBacktestResult>;

  // Default strategy parameters (can be made configurable later)
  private defaultStopLossPercent = -5; 
  private defaultTakeProfitPercent = 15; 
  private defaultMaxHoldingTimeHours = 4; 

  constructor(config: BacktestConfig) {
    this.config = {
      priceDataPath: './data/historical',
      saveResults: true,
      ...config
    };
    
    // Initialize results for each pattern
    const patterns: PatternType[] = this.config.patternTypes || [
      'Mega Pump and Dump',
      'Volatility Squeeze',
      'Smart Money Trap',
      'Algorithmic Stop Hunt',
      'Smart Money Reversal'
    ];
    
    patterns.forEach(pattern => {
      this.results[pattern] = {
        patternName: pattern,
        detectionCount: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        avgReturn: 0,
        maxReturn: 0,
        maxDrawdown: 0,
        avgHoldingTimeHours: 0,
        profitFactor: 0,
        trades: []
      };
    });
  }
  
  /**
   * Load historical price data
   */
  public async loadPriceData(): Promise<boolean> {
    try {
      const tokenAddress = this.config.tokenAddress;
      
      // Try to load data from file
      const dataDir = this.config.priceDataPath || './data/historical';
      const filePath = path.join(dataDir, `${tokenAddress}.json`);
      
      if (fs.existsSync(filePath)) {
        logger.info(`Loading price data from file: ${filePath}`);
        const fileData = fs.readFileSync(filePath, 'utf8');
        this.priceData = JSON.parse(fileData);
      } else {
        // In a real implementation, you would fetch historical data
        // from an API or other data source
        logger.warn(`Price data file not found: ${filePath}`);
        return false;
      }
      
      // Filter by timestamp range
      if (this.config.startTimestamp && this.config.endTimestamp) {
        this.priceData = this.priceData.filter(
          p => p.timestamp >= this.config.startTimestamp && 
               p.timestamp <= this.config.endTimestamp
        );
      }
      
      logger.info(`Loaded ${this.priceData.length} price data points for token ${tokenAddress}`);
      return this.priceData.length > 0;
    } catch (error) {
      logger.error('Error loading price data', error);
      return false;
    }
  }
  
  /**
   * Run backtest for all selected patterns
   */
  public async runBacktest(): Promise<Record<PatternType, PatternBacktestResult>> {
    try {
      logger.info('Starting pattern backtest...');
      
      if (this.priceData.length === 0) {
        const loaded = await this.loadPriceData();
        if (!loaded) {
          throw new Error('No price data available for backtest');
        }
      }
      
      // Chronologically process each price point
      for (let i = 0; i < this.priceData.length; i++) {
        const currentPoint = this.priceData[i];
        
        // Skip iteration if points are missing
        if (!currentPoint) {
          logger.warn(`Skipping backtest iteration ${i} due to missing data point.`);
          continue;
        }
        
        // Need at least 5 data points to establish a pattern
        if (i < 5) continue;
        
        // Create a simulated market state for pattern detection
        const simulatedToken = this.createSimulatedToken(i);
        
        // Detect patterns
        const detectedPatterns = this.detectPatterns(simulatedToken);
        
        // For each detected pattern, simulate trading
        for (const pattern of detectedPatterns) {
          this.simulateTrade(pattern, i);
        }
      }
      
      // Calculate final statistics
      this.calculateResults();
      
      // Save results if configured
      if (this.config.saveResults) {
        this.saveResults();
      }
      
      logger.info('Backtest completed', {
        token: this.config.tokenAddress,
        patterns: Object.keys(this.results).length
      });
      
      return this.results;
    } catch (error) {
      logger.error('Error running backtest', error);
      return this.results;
    }
  }
  
  /**
   * Create a simulated token for pattern detection
   */
  private createSimulatedToken(index: number): any {
    // Get current and previous price points
    const currentPoint = this.priceData[index];
    const prevPoints = this.priceData.slice(Math.max(0, index - 5), index);
    
    // Skip iteration if points are missing
    if (!currentPoint || prevPoints.length === 0) {
      logger.warn(`Skipping backtest iteration ${index} due to missing data point.`);
      return null;
    }
    
    // Calculate buy ratio based on current point
    const buyRatio = (currentPoint.buys ?? 0) / ((currentPoint.sells ?? 0) || 1);
    
    // Calculate volume change
    const volumeChange = this.calculateVolumeChange(prevPoints);
    
    // Create simulated token object similar to what token discovery provides
    return {
      address: this.config.tokenAddress,
      symbol: 'SIMTOKEN',
      name: 'Simulated Token',
      price: currentPoint.price ?? 0,
      liquidity: currentPoint.liquidity ?? 0,
      volume24h: (currentPoint.volume ?? 0) * 24, // Simulate 24h volume
      buyRatio,
      buys5min: currentPoint.buys ?? 0,
      sells5min: currentPoint.sells ?? 0,
      volumeChange,
      age: 12, // Fixed simulated age (12 hours)
      isNew: true,
      score: 70, // Simulated discovery score
      timestamp: currentPoint.timestamp,
      priceHistory: prevPoints.map(p => p.price).concat(currentPoint.price ?? 0)
    };
  }

  private calculateVolumeChange(prevPoints: PriceDataPoint[]): number {
    if (!prevPoints || prevPoints.length === 0) return 0;
    
    const lastPoint = prevPoints[prevPoints.length - 1];
    if (!lastPoint) return 0;
    
    const currentIndex = this.priceData.findIndex(p => 
      p.timestamp === lastPoint.timestamp && 
      p.price === lastPoint.price && 
      p.volume === lastPoint.volume
    );
    
    if (currentIndex === -1 || currentIndex + 1 >= this.priceData.length) return 0;
    
    const nextPoint = this.priceData[currentIndex + 1];
    if (!nextPoint) return 0;
    
    const prevVolume = lastPoint.volume ?? 0;
    const currentVolume = nextPoint.volume ?? 0;
    
    return prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : 0;
  }

  /**
   * Detect patterns based on current market state
   */
  private detectPatterns(token: any): PatternMatch[] {
    // In a real implementation, you would use the actual PatternDetector
    // Here we'll simulate pattern detection logic
    
    const patterns: PatternMatch[] = [];
    const patternTypes = this.config.patternTypes || [
      'Mega Pump and Dump',
      'Volatility Squeeze',
      'Smart Money Trap',
      'Algorithmic Stop Hunt',
      'Smart Money Reversal'
    ];
    
    for (const patternType of patternTypes) {
      const confidence = this.simulatePatternConfidence(token, patternType);
      
      if (confidence >= 65) { // Minimum confidence threshold
        patterns.push({
          pattern: patternType,
          confidence,
          signalType: 'buy' 
        });
        
        // Record detection in results
        this.results[patternType].detectionCount++;
      }
    }
    
    return patterns;
  }
  
  /**
   * Simulate pattern confidence calculation
   */
  private simulatePatternConfidence(token: any, patternType: string): number {
    // This is a simplified simulation of pattern detection
    // In a real implementation, you would use actual pattern detection algorithms
    
    switch (patternType) {
      case 'Mega Pump and Dump':
        return token.buyRatio > 1.5 && token.volumeChange > 80 ? 85 : 40;
        
      case 'Volatility Squeeze':
        // Check for low volatility followed by breakout
        if (token.priceHistory && token.priceHistory.length >= 5) {
          const prices = token.priceHistory.slice(-5);
          const mean = prices.slice(0, 4).reduce((sum: number, p: number) => sum + p, 0) / 4;
          const variance = prices.slice(0, 4)
            .reduce((sum: number, p: number) => sum + Math.pow(p - mean, 2), 0) / 4;
          const stdDev = Math.sqrt(variance);
          
          return (stdDev / mean < 0.03 && prices[4] > prices[3] * 1.03) ? 75 : 30;
        }
        return 30;
        
      case 'Smart Money Trap':
        return token.buyRatio > 1.2 && token.liquidity > 80000 ? 70 : 35;
        
      case 'Algorithmic Stop Hunt':
        if (token.priceHistory && token.priceHistory.length >= 4) {
          const prices = token.priceHistory.slice(-4);
          const drop = ((prices[1] - prices[2]) / prices[1]) * 100;
          const recovery = ((prices[3] - prices[2]) / prices[2]) * 100;
          
          return (drop > 5 && recovery > 3) ? 80 : 25;
        }
        return 25;
        
      case 'Smart Money Reversal':
        if (token.priceHistory && token.priceHistory.length >= 5) {
          const prices = token.priceHistory.slice(-5);
          const trend1 = prices[1] - prices[0];
          const trend2 = prices[2] - prices[1];
          const trend3 = prices[3] - prices[2];
          const trend4 = prices[4] - prices[3];
          
          // Look for down-down-down-up pattern
          return (trend1 < 0 && trend2 < 0 && trend3 < 0 && trend4 > 0) ? 70 : 20;
        }
        return 20;
        
      default:
        return 0;
    }
  }
  
  /**
   * Simulate trade execution and tracking
   */
  private simulateTrade(pattern: PatternMatch, startIndex: number): void {
    try {
      // Skip if no data points after detection
      if (startIndex >= this.priceData.length - 1) {
        return;
      }
      
      const entryPrice = this.priceData[startIndex]?.price ?? 0;
      if (entryPrice === 0) return;
      
      const entryTime = this.priceData[startIndex]?.timestamp ?? 0;
      
      // Skip if price is missing
      if (entryPrice === undefined || entryPrice === null) {
        logger.warn(`Cannot execute trade for ${this.config.tokenAddress} at index ${startIndex}: entryPrice is undefined.`);
        return;
      }
      
      // Convert stop loss and take profit to price levels using defaults
      const stopLossPrice = entryPrice * (1 + this.defaultStopLossPercent / 100);
      const takeProfitPrice = entryPrice * (1 + this.defaultTakeProfitPercent / 100);
      
      // Calculate max holding time in milliseconds using default
      const maxHoldingTime = this.defaultMaxHoldingTimeHours * 60 * 60 * 1000;
      const maxExitTime = entryTime + maxHoldingTime;
      
      let exitPrice = 0;
      let exitTime = 0;
      let exitReason = '';
      
      // Simulate trade through subsequent price points
      for (let i = startIndex + 1; i < this.priceData.length; i++) {
        const currentPoint = this.priceData[i];
        
        // Skip iteration if points are missing
        if (!currentPoint) {
          logger.warn(`Skipping backtest iteration ${i} due to missing data point.`);
          continue;
        }
        
        const currentPrice = currentPoint.price;
        const currentTime = currentPoint.timestamp;
        
        // Check for stop loss
        if (currentPrice <= stopLossPrice) {
          exitPrice = currentPrice;
          exitTime = currentTime;
          exitReason = 'Stop Loss';
          break;
        }
        
        // Check for take profit
        if (currentPrice >= takeProfitPrice) {
          exitPrice = currentPrice;
          exitTime = currentTime;
          exitReason = 'Take Profit';
          break;
        }
        
        // Check for max holding time
        if (currentTime >= maxExitTime) {
          exitPrice = currentPrice;
          exitTime = currentTime;
          exitReason = 'Max Holding Time';
          break;
        }
        
        // If no exit condition met, use the last price point
        if (i === this.priceData.length - 1) {
          exitPrice = currentPrice;
          exitTime = currentTime;
          exitReason = 'End of Data';
        }
      }
      
      // Calculate PnL and holding time
      const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
      const holdingTimeHours = (exitTime - entryTime) / (1000 * 60 * 60);
      
      // Record the trade result
      const tradeResult = {
        timestamp: entryTime,
        entryPrice,
        exitPrice,
        holdingTimeHours,
        pnlPercent,
        exitReason
      };
      
      this.results[pattern.pattern].trades.push(tradeResult); 
      this.results[pattern.pattern].detectionCount++; 
      
      // Update win/loss counters
      if (pnlPercent > 0) {
        this.results[pattern.pattern].winCount++;
      } else if (pnlPercent < 0) {
        this.results[pattern.pattern].lossCount++;
      }
    } catch (error) {
      logger.error(`Error simulating trade for pattern ${pattern.pattern}:`, error); 
    }
  }
  
  /**
   * Calculate final backtest results
   */
  public calculateResults(): void {
    Object.values(this.results).forEach(result => {
      if (result.trades.length === 0) {
        return; // No trades for this pattern
      }
      
      let totalReturn = 0;
      let positiveReturns = 0;
      let negativeReturns = 0;
      let maxReturn = -Infinity;
      let maxDrawdown = 0;
      let peakValue = 1;
      let currentValue = 1;
      let totalHoldingTime = 0;
      let profitSum = 0;
      let lossSum = 0;
      
      result.trades.forEach(trade => {
        totalReturn += trade.pnlPercent;
        totalHoldingTime += trade.holdingTimeHours;
        
        if (trade.pnlPercent > 0) {
          positiveReturns++;
          profitSum += trade.pnlPercent;
        } else if (trade.pnlPercent < 0) {
          negativeReturns++;
          lossSum += Math.abs(trade.pnlPercent);
        }
        
        maxReturn = Math.max(maxReturn, trade.pnlPercent);
        
        // Calculate drawdown
        currentValue *= (1 + trade.pnlPercent / 100);
        peakValue = Math.max(peakValue, currentValue);
        const drawdown = (peakValue - currentValue) / peakValue;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      });
      
      result.detectionCount = result.trades.length; 
      result.winRate = result.trades.length > 0 ? (positiveReturns / result.trades.length) * 100 : 0;
      result.avgReturn = result.trades.length > 0 ? totalReturn / result.trades.length : 0;
      result.avgHoldingTimeHours = result.trades.length > 0 ? totalHoldingTime / result.trades.length : 0;
      result.maxReturn = maxReturn === -Infinity ? 0 : maxReturn; 
      result.maxDrawdown = maxDrawdown * 100; 
      result.profitFactor = lossSum > 0 ? profitSum / lossSum : (profitSum > 0 ? Infinity : 0);
    });
  }
  
  /**
   * Save backtest results to file
   */
  private saveResults(): void {
    try {
      const dataDir = this.config.priceDataPath || './data/historical';
      
      // Ensure directory exists
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const filePath = path.join(dataDir, 
        `backtest_${this.config.tokenAddress}_${timestamp}.json`);
      
      fs.writeFileSync(filePath, JSON.stringify(this.results, null, 2));
      
      logger.info(`Backtest results saved to ${filePath}`);
    } catch (error) {
      logger.error('Error saving backtest results', error);
    }
  }
  
  /**
   * Get summary of backtest results
   */
  public getResultsSummary(): any {
    const summary: any = {
      token: this.config.tokenAddress,
      totalPatterns: Object.keys(this.results).length,
      totalTrades: 0,
      overallWinRate: 0,
      bestPattern: '',
      bestPatternReturn: 0,
      startTime: new Date(this.config.startTimestamp).toISOString(),
      endTime: new Date(this.config.endTimestamp).toISOString(),
      patterns: {}
    };
    
    let totalWins = 0;
    let totalTrades = 0;
    
    for (const patternName in this.results) {
      const result = this.results[patternName as PatternType];
      
      // Skip patterns with no trades
      if (result.trades.length === 0) continue;
      
      // Add pattern summary
      summary.patterns[patternName] = {
        trades: result.trades.length,
        winRate: result.winRate.toFixed(2) + '%',
        avgReturn: result.avgReturn.toFixed(2) + '%',
        maxReturn: result.maxReturn.toFixed(2) + '%',
        maxDrawdown: result.maxDrawdown.toFixed(2) + '%',
        profitFactor: result.profitFactor.toFixed(2)
      };
      
      // Update totals
      totalWins += result.winCount;
      totalTrades += result.trades.length;
      
      // Check if this is the best pattern
      if (result.avgReturn > summary.bestPatternReturn) {
        summary.bestPattern = patternName;
        summary.bestPatternReturn = result.avgReturn;
      }
    }
    
    // Calculate overall win rate
    summary.totalTrades = totalTrades;
    summary.overallWinRate = totalTrades > 0 ? 
                            ((totalWins / totalTrades) * 100).toFixed(2) + '%' : '0%';
    summary.bestPatternReturn = summary.bestPatternReturn.toFixed(2) + '%';
    
    return summary;
  }
}

export default PatternBacktester;
