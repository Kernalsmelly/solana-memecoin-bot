import { describe, it, expect } from 'vitest';
describe('Dynamic Sizing Formula', () => {
    // sizeSOL = min(maxExposureSol, balance * riskPct / sigma30m)
    function calcSizeSOL(balance, riskPct, sigma30m, maxExposureSol) {
        return Math.min(maxExposureSol, (balance * riskPct) / sigma30m);
    }
    it('returns sensible trade sizes for typical values', () => {
        // Example 1: moderate volatility
        expect(calcSizeSOL(1000, 0.002, 0.05, 100)).toBeCloseTo(40, 3); // 1000*0.002/0.05=40
        // Example 2: high volatility
        expect(calcSizeSOL(1000, 0.002, 0.5, 100)).toBeCloseTo(4, 3); // 1000*0.002/0.5=4
        // Example 3: size capped by maxExposureSol
        expect(calcSizeSOL(100000, 0.01, 0.01, 2)).toBe(2); // capped at maxExposureSol
    });
});
//# sourceMappingURL=dynamicSizing.test.js.map