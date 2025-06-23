import { TokenMetrics } from './fetchTokenMetrics';
import { RiskManager } from '../live/riskManager';
import { AccountBalance } from '../positionManager';

/**
 * Calculates optimal position size based on risk, liquidity, and available balance.
 * @param token TokenMetrics for the trade
 * @param riskManager Instance of RiskManager
 * @param accountBalance Current account balance info
 * @returns Position size in USD
 */
export function calculatePositionSize(
  token: TokenMetrics,
  riskManager: RiskManager,
  accountBalance: AccountBalance
): number {
  // Get max allowed position size from risk manager config
  const maxPositionUsd = riskManager.config.maxPositionValueUsd || 50;
  const minPositionUsd = riskManager.config.minPositionValueUsd || 10;

  // Use a fraction of liquidity to avoid moving the market
  const maxLiquidityPercent = riskManager.config.maxLiquidityPercent || 0.05; // 5% default
  const liquidityCap = token.liquidity ? token.liquidity * maxLiquidityPercent : maxPositionUsd;

  // Use available cash, but not more than allowed by risk or liquidity
  let size = Math.min(maxPositionUsd, liquidityCap, accountBalance.availableCash);
  if (size < minPositionUsd) return 0;

  // Optional: Adjust for volatility (smaller size for higher volatility)
  // e.g., reduce size if 24h price change > 50%
  if (token.priceUsd && token.volume24h && token.priceUsd > 0 && token.volume24h > 0) {
    // Example: crude volatility proxy
    if (token.volume24h / token.priceUsd > 1000) {
      size *= 0.8; // Reduce size for very high turnover
    }
  }

  return Math.floor(size);
}
