import { describe, it, expect, beforeAll } from 'vitest';
import { Trader } from '../src/lib/Trader';
import { ResilientSolanaConnection } from '../src/lib/ResilientSolanaConnection';

// Mock connection for test
class MockConnection {}

// Mock fetchRecentOHLCVSeries to return deterministic bars
import { vi } from 'vitest';
vi.mock('../src/utils/logger.js', () => import('./mocks/mockLogger'));
vi.mock('../src/utils/priceFeedManager', () => ({
  PriceFeedManager: vi.fn().mockImplementation(() => ({
    fetchRecentOHLCVSeries: async (_address: string, minutes: number) => {
      // Return a predictable series: price increases 1% per bar, volume constant
      const bars = [];
      let price = 100;
      for (let i = 0; i < minutes; ++i) {
        bars.push({
          address: 'mock',
          open: price,
          high: price,
          low: price,
          close: price * 1.01,
          volume: 1000,
          timestamp: Date.now() - (minutes - i) * 60 * 1000,
        });
        price *= 1.01;
      }
      return bars;
    },
  })),
}));

describe('Pattern Calibration', () => {
  let trader: Trader;
  beforeAll(() => {
    trader = new Trader(new MockConnection() as any);
  });

  it('should select the highest priceChangeThreshold with the most matches', async () => {
    const results = await trader.backtestAndApplyThresholds({
      minutes: 10,
      grid: { PRICE_CHANGE_THRESHOLD: [0.5, 1, 2], VOLUME_MULTIPLIER: [0.5, 1] },
    });
    expect(results.length).toBeGreaterThan(0);
    const best = results.reduce((a, b) => (a.netPnL > b.netPnL ? a : b));
    expect(best.patternMatchCount).toBeGreaterThan(0);
    expect(best.params.priceChangeThreshold).toBe(0.5);
  });
});
