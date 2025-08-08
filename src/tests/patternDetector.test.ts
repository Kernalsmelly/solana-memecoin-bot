import { PatternDetector } from '../strategies/patternDetector';
import { describe, it, expect, vi } from 'vitest';

describe('PatternDetector', () => {
  it('detects Mega Pump & Dump', () => {
    const detector = new PatternDetector();
    const address = '0xPUMP';
    const now = Date.now();
    // Simulate 12h of flat, then +40% price and 1.7x volume
    for (let i = 0; i < 24; i++) {
      detector.handleOHLCV({
        address,
        close: 1,
        volume: 100,
        timestamp: now - (24 - i) * 30 * 60 * 1000,
      });
    }
    // Pump event
    let matched = false;
    detector.on('patternMatch', (e: any) => {
      if (e.strategy === 'pumpDump') matched = true;
    });
    detector.handleOHLCV({ address, close: 1.41, volume: 170, timestamp: now });
    expect(matched).toBe(true);
  });

  it('detects Smart Money Trap', () => {
    const detector = new PatternDetector();
    const address = '0xTRAP';
    const now = Date.now();
    // Simulate 1h of flat, then +15% price, 0.8x SMA volume, buyRatio 2
    // Fill window: 12 entries, 5min apart, all within last hour
    for (let i = 0; i < 12; i++) {
      detector.handleOHLCV({
        address,
        close: 1,
        volume: 100,
        timestamp: now - (11 - i) * 5 * 60 * 1000,
      });
    }
    let matched = false;
    detector.on('patternMatch', (e: any) => {
      if (e.strategy === 'smartTrap') matched = true;
    });
    // Fire event with price +15%, vol 80 (0.8x SMA), buyRatio 2
    detector.handleOHLCV({ address, close: 1.151, volume: 80, buyRatio: 2, timestamp: now });
    expect(matched).toBe(true);
  });
});
