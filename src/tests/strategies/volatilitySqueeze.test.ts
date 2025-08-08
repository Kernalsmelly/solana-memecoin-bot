import { vi } from 'vitest';
vi.mock('../../../src/utils/logger', () => import('../../mocks/mockLogger'));
import { PatternDetector } from '../../../src/strategy/patternDetector';
import { PatternMatch } from '../../../src/types';

describe('PatternDetector Volatility Squeeze', () => {
  it('detects Volatility Squeeze with breakout and emits correct confidence/meta', () => {
    const mockRiskManager = {
      getAccountBalance: () => ({ availableCash: 1000, allocatedCash: 0, totalValue: 1000 }),
    };
    const detector = new PatternDetector({
      tokenDiscovery: { on: vi.fn() } as any,
      riskManager: mockRiskManager as any,
      maxTokenAge: 48,
      minLiquidity: 1000,
      maxPositionValue: 100,
    });

    // Simulate price history with a squeeze and breakout
    const base = 100;
    // 19 periods of flat price, then breakout as last price in history
    const prices = Array(19).fill(100).concat([106]); // Sharper breakout at end

    const token = {
      symbol: 'SQUEEZED',
      address: 'token1',
      age: 5,
      liquidity: 100000,
      price: 105,
      priceChange24h: 100,
      volumeChange24h: 100,
      buyRatio: 10,
      priceHistory: prices,
    };

    // Debug: calculate bandWidth and upper band
    const period = 20;
    const slice = prices.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
    const upper = mean + 2 * std;
    const lower = mean - 2 * std;
    const bandWidth = (upper - lower) / mean;
    // eslint-disable-next-line no-console
    console.log('Test Bollinger debug:', {
      mean,
      std,
      upper,
      lower,
      bandWidth,
      last: prices[prices.length - 1],
    });

    const match: PatternMatch | null = (detector as any).analyzePatternMatch(token);
    expect(match).toBeTruthy();
    expect(match?.pattern).toBe('Volatility Squeeze');
    expect(match?.confidence).toBeGreaterThanOrEqual(80);
    expect(match?.meta).toHaveProperty('squeezeStrength');
    expect(match?.meta).toHaveProperty('bandWidth');
  });

  it('does not match when no squeeze breakout', () => {
    const mockRiskManager = {
      getAccountBalance: () => ({ availableCash: 1000, allocatedCash: 0, totalValue: 1000 }),
    };
    const detector = new PatternDetector({
      tokenDiscovery: { on: vi.fn() } as any,
      riskManager: mockRiskManager as any,
      maxTokenAge: 48,
      minLiquidity: 1000,
      maxPositionValue: 100,
    });

    // Flat price, no breakout
    const prices = Array(20).fill(100);
    const token = {
      symbol: 'FLAT',
      address: 'token2',
      age: 5,
      liquidity: 2000,
      price: 100,
      priceChange24h: 0.5,
      volumeChange24h: 10,
      buyRatio: 1.1,
      priceHistory: prices,
    };
    const match: PatternMatch | null = (detector as any).analyzePatternMatch(token);
    expect(match).toBeFalsy();
  });
});
