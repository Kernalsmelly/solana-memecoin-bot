import { PricePoint } from '../utils/mockPriceFeed.js';

interface MomentumAnalysis {
  signal: 'BUY' | 'SELL' | 'HOLD';
  roc: number;
  volatility: number;
  confidence: number;
  reason: string;
}

interface StrategyConfig {
  volatilityThreshold: number; // Base volatility threshold
  minRocThreshold: number; // Minimum ROC for buy signal
  maxVolatilityThreshold: number; // Maximum allowed volatility
  confidenceThreshold: number; // Minimum confidence required
}

// Default configuration
const defaultConfig: StrategyConfig = {
  volatilityThreshold: 2.5, // 2.5% base volatility threshold
  minRocThreshold: 5.0, // 5% minimum ROC for buy signal
  maxVolatilityThreshold: 8.0, // 8% maximum volatility threshold
  confidenceThreshold: 60.0, // 60% minimum confidence
};

export async function analyzeMomentum(
  priceHistory: PricePoint[],
  currentPrice: number,
  config: Partial<StrategyConfig> = {},
): Promise<MomentumAnalysis> {
  // Merge provided config with defaults
  const finalConfig = { ...defaultConfig, ...config };

  if (priceHistory.length < 2) {
    return {
      signal: 'HOLD',
      roc: 0,
      volatility: 0,
      confidence: 0,
      reason: 'Insufficient price history',
    };
  }

  // Calculate Rate of Change (ROC)
  const oldestPricePoint = priceHistory[0];
  if (!oldestPricePoint) {
    return {
      signal: 'HOLD',
      roc: 0,
      volatility: 0,
      confidence: 0,
      reason: 'Error accessing oldest price',
    };
  }
  const oldestPrice = oldestPricePoint.price;
  const roc = ((currentPrice - oldestPrice) / oldestPrice) * 100;

  // Calculate volatility using standard deviation of returns
  const returns = priceHistory
    .map((point, i) => {
      if (i === 0) return 0;
      const prevPoint = priceHistory[i - 1];
      // Check if both current point and previous point exist and have prices
      if (
        !point ||
        typeof point.price !== 'number' ||
        !prevPoint ||
        typeof prevPoint.price !== 'number'
      ) {
        // logger.warn(`Invalid price data at index ${i} or ${i-1} in rocMomentum`);
        return 0; // Return 0 or handle error appropriately
      }
      return ((point.price - prevPoint.price) / prevPoint.price) * 100;
    })
    .slice(1);

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const volatility = Math.sqrt(
    returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length,
  );

  // Calculate confidence based on ROC and volatility
  let confidence = 0;

  if (roc > finalConfig.minRocThreshold) {
    // Base confidence on ROC strength
    confidence = Math.min(100, (roc / finalConfig.minRocThreshold) * 70);

    // Adjust confidence based on volatility
    if (volatility > finalConfig.volatilityThreshold) {
      const volatilityPenalty = Math.min(
        70,
        ((volatility - finalConfig.volatilityThreshold) /
          (finalConfig.maxVolatilityThreshold - finalConfig.volatilityThreshold)) *
          70,
      );
      confidence = Math.max(0, confidence - volatilityPenalty);
    }
  }

  // Determine signal based on thresholds
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let reason = '';

  if (volatility > finalConfig.maxVolatilityThreshold) {
    signal = 'HOLD';
    reason = `Volatility (${volatility.toFixed(2)}%) exceeds maximum threshold (${finalConfig.maxVolatilityThreshold}%)`;
  } else if (roc < finalConfig.minRocThreshold) {
    signal = 'HOLD';
    reason = `ROC (${roc.toFixed(2)}%) below minimum threshold (${finalConfig.minRocThreshold}%)`;
  } else if (confidence < finalConfig.confidenceThreshold) {
    signal = 'HOLD';
    reason = `Confidence (${confidence.toFixed(2)}%) below required threshold (${finalConfig.confidenceThreshold}%)`;
  } else {
    signal = 'BUY';
    reason = `Strong momentum with acceptable volatility`;
  }

  return {
    signal,
    roc,
    volatility,
    confidence,
    reason,
  };
}

export function calculatePositionSize(
  analysis: MomentumAnalysis,
  maxPosition: number,
  availableBalance: number,
): number {
  // Base position size on confidence
  const confidenceMultiplier = analysis.confidence / 100;

  // Additional reduction based on volatility
  const volatilityMultiplier = Math.max(0.3, 1 - analysis.volatility / 10);

  // Calculate final position size
  const position = maxPosition * confidenceMultiplier * volatilityMultiplier;

  // Ensure we don't exceed available balance
  return Math.min(position, availableBalance);
}

export function calculateStopLoss(currentPrice: number, analysis: MomentumAnalysis): number {
  // Dynamic stop loss based on volatility
  const stopLossPercentage = Math.max(2, analysis.volatility * 1.5);
  return currentPrice * (1 - stopLossPercentage / 100);
}
