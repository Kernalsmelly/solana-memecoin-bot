import { describe, it, expect } from 'vitest';

// Example netPnL calculation as implemented in TradingEngine.sellToken
function calcNetPnL({ rawPnL, feePaidSol, currentPrice, slippageBps, amount }: {
  rawPnL: number,
  feePaidSol: number,
  currentPrice: number,
  slippageBps: number,
  amount: number
}) {
  let netPnL = rawPnL;
  netPnL -= feePaidSol * currentPrice;
  netPnL -= (slippageBps / 10000) * currentPrice * amount;
  return netPnL;
}

describe('PnL Cost Modeling', () => {
  it('subtracts on-chain fees and slippage from gross PnL', () => {
    const params = {
      rawPnL: 10,           // 10 SOL gross profit
      feePaidSol: 0.002,    // 0.002 SOL fee
      currentPrice: 100,    // 100 USDC/SOL
      slippageBps: 50,      // 0.5% slippage
      amount: 1             // 1 SOL trade
    };
    // fees = 0.002 * 100 = 0.2 USDC
    // slippage = 0.005 * 100 * 1 = 0.5 USDC
    // netPnL = 10 - 0.2 - 0.5 = 9.3
    const netPnL = calcNetPnL(params);
    expect(netPnL).toBeCloseTo(9.3, 5);
  });
});
