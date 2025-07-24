// Using Vitest fake timers to stabilize concurrency/cooldown tests
import { StrategyCoordinator } from '../../strategy/StrategyCoordinator';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('StrategyCoordinator concurrency & cooldown', async () => {
  const coordinator = new StrategyCoordinator({ maxConcurrent: 3, cooldownMs: 300 }); // 300ms cooldown for test
  const tokens = ['A', 'B', 'C', 'D', 'E'];
  const active: Set<string> = new Set();
  const dispatchOrder: string[] = [];
  let overlapDetected = false;

  coordinator.on('tokenDispatch', (token) => {
    dispatchOrder.push(token);
    if (active.has(token)) overlapDetected = true;
    active.add(token);
    // Simulate execution time
    setTimeout(() => {
      active.delete(token);
      coordinator.completeToken(token);
    }, 100);
  });

  // Rapidly enqueue all tokens
  tokens.forEach((t) => coordinator.enqueueToken(t));

  // Process all initial dispatches and completions
  vi.advanceTimersByTime(100); // First batch completes
  vi.advanceTimersByTime(300); // Cooldowns expire, next batch dispatched
  vi.advanceTimersByTime(100); // Second batch completes
  vi.advanceTimersByTime(300); // Cooldowns expire
  vi.advanceTimersByTime(100); // Final completions

  // Assertions
  expect(overlapDetected).toBe(false);
  expect(dispatchOrder.length).toBe(tokens.length);
  expect(coordinator.getStatus().active.length).toBeLessThanOrEqual(3);

  // Try to re-enqueue a token before cooldown expires (should NOT dispatch)
  coordinator.enqueueToken('A');
  vi.advanceTimersByTime(100); // Should not dispatch again
  expect(dispatchOrder.filter(t => t === 'A').length).toBe(1);

  // Wait for cooldown to expire, then enqueue again (should dispatch)
  vi.advanceTimersByTime(300); // After cooldown
  coordinator.enqueueToken('A');
  vi.advanceTimersByTime(100);
  expect(dispatchOrder.filter(t => t === 'A').length).toBe(2);
});
