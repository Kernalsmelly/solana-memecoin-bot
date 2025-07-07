import { describe, it, expect, vi } from 'vitest';

// Simulate alert firing logic
function simulateConsecutiveLosses(tradePnls: number[], alertFn: () => void, threshold = 3) {
  let consecutiveLosses = 0;
  let alertFired = false;
  for (const pnl of tradePnls) {
    if (pnl < 0) {
      consecutiveLosses++;
    } else {
      consecutiveLosses = 0;
    }
    if (consecutiveLosses >= threshold && !alertFired) {
      alertFn();
      alertFired = true;
    }
  }
}

describe('Consecutive Loss Alert', () => {
  it('fires alert exactly once after 3 consecutive losses', () => {
    const alert = vi.fn();
    simulateConsecutiveLosses([-1, -2, -3, -4, 2, -1, -2, -3], alert, 3);
    expect(alert).toHaveBeenCalledTimes(1);
  });
  it('does not fire if losses are not consecutive', () => {
    const alert = vi.fn();
    simulateConsecutiveLosses([-1, 1, -2, 1, -3], alert, 3);
    expect(alert).not.toHaveBeenCalled();
  });
});
