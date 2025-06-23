import { describe, test, expect } from 'vitest';
import { TokenMonitor } from '../tokenMonitor';

describe('TokenMonitor', () => {
  test('can instantiate and add dummy token', async () => {
    const monitor = new TokenMonitor();
    await monitor.addToken({ tokenAddress: 'So11111111111111111111111111111111111111112' });
    expect(monitor).toBeTruthy();
  });
});
