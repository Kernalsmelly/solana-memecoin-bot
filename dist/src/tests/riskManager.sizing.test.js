import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('../utils/logger', () => import('./mocks/mockLogger'));
import { RiskManager } from '../live/riskManager';
describe('RiskManager.getDynamicPositionSizeSol', () => {
    let riskManager;
    const token = 'SOL';
    beforeEach(() => {
        riskManager = new RiskManager({
            maxDrawdown: 0.2,
            maxDailyLoss: 0.1,
            maxPositions: 5,
            maxPositionSize: 10,
        });
        // Reset price history
        // @ts-ignore
        riskManager.priceHistory.set(token, []);
    });
    it('returns balance*riskPct if no volatility info', () => {
        const size = riskManager.getDynamicPositionSizeSol(token, 100, 0.01, 2);
        expect(size).toBeCloseTo(1, 6); // 100*0.01 = 1
    });
    it('returns min(maxExposure, balance*riskPct/sigma) with volatility', () => {
        // Simulate price history: mean=10, sigma=2
        const now = Date.now();
        const prices = [8, 10, 12, 10, 10]; // mean=10, stddev~1.58
        // @ts-ignore
        riskManager.priceHistory.set(token, prices.map((p, i) => ({ price: p, timestamp: now - i * 1000 })));
        const size = riskManager.getDynamicPositionSizeSol(token, 100, 0.02, 3);
        // balance*riskPct = 2, sigma=sqrt(2) ≈ 1.4142 => 2/1.4142 ≈ 1.4142, maxExposure=3
        expect(size).toBeCloseTo(1.4142, 4);
    });
    it('caps at maxExposureSol', () => {
        // Simulate very low volatility (sigma=0.01)
        const now = Date.now();
        // @ts-ignore
        riskManager.priceHistory.set(token, Array(10).fill({ price: 10, timestamp: now }));
        const size = riskManager.getDynamicPositionSizeSol(token, 100, 0.5, 2);
        expect(size).toBeLessThanOrEqual(2);
    });
    it('handles zero sigma (flat price)', () => {
        const now = Date.now();
        // @ts-ignore
        riskManager.priceHistory.set(token, [10, 10, 10, 10].map((p, i) => ({ price: p, timestamp: now - i * 1000 })));
        const size = riskManager.getDynamicPositionSizeSol(token, 50, 0.1, 10);
        expect(size).toBeCloseTo(5, 6); // fallback: balance*riskPct
    });
});
//# sourceMappingURL=riskManager.sizing.test.js.map