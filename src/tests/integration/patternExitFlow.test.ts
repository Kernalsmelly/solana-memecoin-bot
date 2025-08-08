import { describe, it, expect } from 'vitest';
import { PatternDetector } from '../../strategies/patternDetector';
import { ExitManager } from '../../strategies/exitManager';

describe('Integration: Pattern & Exit Flow', () => {
  it('fires pattern event and triggers exit event', async () => {
    const detector = new PatternDetector();
    const exitManager = new ExitManager({ stopLossPct: 10, takeProfitPct: 20, timeoutMs: 1000 });
    const address = '0xINTEG';
    const now = Date.now();
    let patternFired = false;
    let exitPromise = new Promise<void>((resolve) => {
      exitManager.on('exitFilled', () => resolve());
    });
    detector.on('patternMatch', (e: any) => {
      patternFired = true;
      exitManager.scheduleExit(address, e.details.close12h || e.details.close, now);
      console.log(
        '[TEST] Scheduled exit for',
        address,
        'at',
        e.details.close12h || e.details.close,
      );
      // Simulate price drop after scheduling exit
      setTimeout(() => {
        console.log('[TEST] Sending price update for', address, 'price 1.26');
        exitManager.onPriceUpdate({ address, price: 1.26, timestamp: now + 100 });
      }, 10);
    });
    // Simulate pump/dump pattern
    for (let i = 0; i < 24; i++) {
      detector.handleOHLCV({
        address,
        close: 1,
        volume: 100,
        timestamp: now - (24 - i) * 30 * 60 * 1000,
      });
    }
    detector.handleOHLCV({ address, close: 1.41, volume: 170, timestamp: now });
    await exitPromise;
    expect(patternFired).toBe(true);
  });
});
