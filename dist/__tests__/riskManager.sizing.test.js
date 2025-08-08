import { describe, it, expect } from 'vitest';
import { RiskManager } from '../src/live/riskManager';
describe('RiskManager dynamic sizing', () => {
    it('computes sensible sizes for real volatility and balances', () => {
        const rm = new RiskManager({
            maxDrawdown: 0.2,
            maxDailyLoss: 0.1,
            maxPositions: 3,
            maxPositionSize: 10,
        });
        // Inject mock price history for token
        const now = Date.now();
        const prices = [10, 10.5, 9.8, 10.2, 10.1, 9.9, 10.3, 10.7, 10.0];
        rm['priceHistory'] = new Map([
            ['TEST', prices.map((p, i) => ({ price: p, timestamp: now - (prices.length - i) * 60000 }))],
        ]);
        // Test with different balances and riskPct
        const size1 = rm.getDynamicPositionSizeSol('TEST', 100, 0.01, 10, 30 * 60 * 1000);
        expect(size1).toBeGreaterThan(0);
        expect(size1).toBeLessThanOrEqual(10);
        const size2 = rm.getDynamicPositionSizeSol('TEST', 10, 0.05, 2, 30 * 60 * 1000);
        expect(size2).toBeGreaterThan(0);
        expect(size2).toBeLessThanOrEqual(2);
        // If volatility is zero, fallback to balance*riskPct
        rm['priceHistory'] = new Map([['TEST', Array(10).fill({ price: 10, timestamp: now })]]);
        const size3 = rm.getDynamicPositionSizeSol('TEST', 50, 0.02, 5, 30 * 60 * 1000);
        expect(size3).toBeCloseTo(1, 1); // 50*0.02 = 1
    });
});
//# sourceMappingURL=riskManager.sizing.test.js.map