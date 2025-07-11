import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenDiscovery } from '../discovery/tokenDiscovery';
import { PatternDetector } from '../strategies/patternDetector';
import { PriceFeedManager } from '../utils/priceFeedManager';
import { LRUCache } from '../utils/cache';

// Mock data and helpers
type MockToken = { address: string; symbol: string; name: string; };
const mockTokens: MockToken[] = [
  { address: 'Token1', symbol: 'TK1', name: 'Token One' },
  { address: 'Token2', symbol: 'TK2', name: 'Token Two' }
];

function mockOHLCV(address: string, base: number, t: number) {
  return {
    address,
    open: base,
    high: base * 1.05,
    low: base * 0.95,
    close: base * (1 + 0.2 * (t % 2)), // alternate squeeze
    volume: 1000 + 100 * t,
    timestamp: Date.now() + t * 60000
  };
}

describe('Hybrid Pipeline', () => {
  let detector: PatternDetector;
  let priceFeed: PriceFeedManager;
  let events: any[];

  beforeEach(() => {
    detector = new PatternDetector();
    priceFeed = new PriceFeedManager({ rateLimiter: { canMakeRequest: async () => true } as any });
    events = [];
    detector.on('patternMatch', (e) => events.push(e));
  });

  it('detects squeeze pattern from synthetic OHLCV', async () => {
    // Feed 60min of data, with squeeze at the end
    const token = mockTokens[0];
    for (let t = 0; t < 60; t++) {
      const ohlcv = mockOHLCV(token.address, 10, t);
      detector.handleOHLCV(ohlcv);
    }
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].address).toBe(token.address);
  });

  it('uses LRU cache for token metadata', () => {
    const cache = new LRUCache<string, number>({ maxSize: 2, ttl: 1000 });
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined(); // evicted
  });

  it('handles fallback on API failure', async () => {
    // Simulate REST failure, expect fallback to mock
    let called = false;
    const pfm = new PriceFeedManager({
      rateLimiter: { canMakeRequest: async () => true } as any,
      dexScreenerApiUrl: 'http://bad.url',
      coingeckoApiUrl: 'http://bad.url'
    });
    const result = await pfm.fetchFallback('Token1');
    expect(result).toBeNull();
  });
});
