import { PublicKey } from '@solana/web3.js';

export interface PositionSizingParams {
  volatility: number; // recent stddev of returns (σ)
  balance: number; // account SOL balance
  maxTradeSize: number; // max SOL per trade
  riskPct: number; // e.g. 0.01 for 1% risk per trade
  poolLiquidityUsd: number;
  maxExposureUsd: number;
  solPrice: number;
}

export function computePositionSize(params: PositionSizingParams): number {
  const { volatility, balance, maxTradeSize, riskPct, poolLiquidityUsd, maxExposureUsd, solPrice } =
    params;
  if (!volatility || volatility <= 0) return 0;
  let sizeSOL = Math.min(maxTradeSize, (riskPct * balance) / volatility);
  // Cap by pool liquidity (e.g. never > 10% of pool)
  const maxByLiquidity = (poolLiquidityUsd / solPrice) * 0.1;
  sizeSOL = Math.min(sizeSOL, maxByLiquidity);
  // Cap by global max exposure
  const maxByExposure = maxExposureUsd / solPrice;
  sizeSOL = Math.min(sizeSOL, maxByExposure);
  return Math.max(0, sizeSOL);
}
