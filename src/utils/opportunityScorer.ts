import { TokenMetrics } from '../types.js';

/**
 * Scores a token opportunity based on liquidity, volume, volatility, price action, buy ratio, age, and trending/social signals.
 * Returns a numeric score and breakdown.
 */
export interface OpportunityScoreResult {
  score: number;
  breakdown: { [key: string]: number };
  reasons: string[];
}

export function scoreOpportunity(metrics: TokenMetrics): OpportunityScoreResult {
  let score = 0;
  const breakdown: { [key: string]: number } = {};
  const reasons: string[] = [];

  // Liquidity
  if (metrics.liquidity && metrics.liquidity > 20000) {
    score += 40;
    breakdown['liquidity'] = 40;
    reasons.push('High liquidity');
  } else if (metrics.liquidity && metrics.liquidity < 3000) {
    score -= 30;
    breakdown['liquidity'] = -30;
    reasons.push('Low liquidity');
  }

  // 24h Volume
  if (metrics.volume24hUsd && metrics.volume24hUsd > 10000) {
    score += 30;
    breakdown['volume24h'] = 30;
    reasons.push('Strong 24h volume');
  } else if (metrics.volume24hUsd && metrics.volume24hUsd < 2000) {
    score -= 20;
    breakdown['volume24h'] = -20;
    reasons.push('Weak 24h volume');
  }

  // 1h Volume / 24h Volume (momentum)
  if (metrics.volume1hUsd && metrics.volume24hUsd) {
    const ratio = metrics.volume1hUsd / metrics.volume24hUsd;
    if (ratio > 0.2) {
      score += 20;
      breakdown['momentum'] = 20;
      reasons.push('High recent momentum');
    }
  }

  // Volatility (stddev/mean)
  if (metrics.volatility && metrics.volatility > 0.07) {
    score += 15;
    breakdown['volatility'] = 15;
    reasons.push('High volatility');
  }

  // Buy ratio
  if (metrics.buyRatio && metrics.buyRatio > 0.6) {
    score += 15;
    breakdown['buyRatio'] = 15;
    reasons.push('Bullish buy ratio');
  } else if (metrics.buyRatio && metrics.buyRatio < 0.4) {
    score -= 20;
    breakdown['buyRatio'] = -20;
    reasons.push('Bearish buy ratio');
  }

  // Age
  if (metrics.pairCreatedAt) {
    const ageMinutes = (Date.now() - metrics.pairCreatedAt) / 60000;
    if (ageMinutes < 30) {
      score -= 20;
      breakdown['age'] = -20;
      reasons.push('Too new (under 30min)');
    } else if (ageMinutes < 10080 && ageMinutes >= 30) {
      // < 7 days
      score += 10;
      breakdown['age'] = 10;
      reasons.push('Recent (under 7 days)');
    }
  }

  // Trending/social (optional, placeholder)
  if ((metrics as any).trending) {
    score += 10;
    breakdown['trending'] = 10;
    reasons.push('Trending/social signal');
  }

  // Negative price momentum
  if (metrics.priceChange1h && metrics.priceChange1h < -0.05) {
    score -= 10;
    breakdown['priceMomentum'] = -10;
    reasons.push('Negative price momentum');
  }

  return { score, breakdown, reasons };
}
