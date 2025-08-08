import { describe, test, expect, vi } from 'vitest';
vi.mock('../utils/logger', () => import('./mocks/mockLogger'));

import { TokenMonitor } from '../tokenMonitor';

describe('TokenMonitor', () => {
  test('can instantiate and add dummy token', async () => {
    const monitor = new TokenMonitor();
    await monitor.addToken({ tokenAddress: 'So11111111111111111111111111111111111111112' });
    expect(monitor).toBeTruthy();
  });
});
