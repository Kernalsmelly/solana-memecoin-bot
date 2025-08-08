import { describe, it, expect } from 'vitest';
// Example: grossPnL = 10, feePaidSol = 0.01, slippageBps = 50, amount = 1, currentPrice = 1
// netPnL = grossPnL - (feePaidSol * currentPrice) - (slippageBps / 10000) * currentPrice * amount
describe('TradingEngine real-cost modeling', () => {
    it('computes netPnL as grossPnL minus fee and slippage', () => {
        const grossPnL = 10;
        const feePaidSol = 0.01; // 0.01 SOL
        const slippageBps = 50; // 0.5%
        const amount = 1;
        const currentPrice = 1; // For simplicity, 1 SOL = 1 USD
        let netPnL = grossPnL;
        netPnL -= feePaidSol * currentPrice;
        netPnL -= (slippageBps / 10000) * currentPrice * amount;
        // Expected: 10 - 0.01 - 0.005 = 9.985
        expect(netPnL).toBeCloseTo(9.985, 6);
    });
});
//# sourceMappingURL=tradingEngine.costs.test.js.map