import { StrategyCoordinator } from '../../strategy/StrategyCoordinator';
import { expect, test, vi } from 'vitest';

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

test('StrategyCoordinator concurrency & cooldown', async () => {
  const coordinator = new StrategyCoordinator({ maxConcurrent: 3, cooldownMs: 300 }); // 300ms cooldown for test
  const tokens = ['A', 'B', 'C', 'D', 'E'];
  const active: Set<string> = new Set();
  const dispatchOrder: string[] = [];
  let overlapDetected = false;

  coordinator.on('tokenDispatch', async (token) => {
    dispatchOrder.push(token);
    if (active.has(token)) overlapDetected = true;
    active.add(token);
    // Simulate execution time
    await wait(100);
    active.delete(token);
    coordinator.completeToken(token);
  });

  // Rapidly enqueue all tokens
  tokens.forEach((t) => coordinator.enqueueToken(t));

  // Wait for all to process (each batch 100ms, cooldown 300ms)
  await wait(1500);

  // Assertions
  expect(overlapDetected).toBe(false);
  expect(dispatchOrder.length).toBe(tokens.length);
  // At no time should more than 3 tokens be active
  expect(coordinator.getStatus().active.length).toBeLessThanOrEqual(3);

  // Try to re-enqueue a token before cooldown expires (should NOT dispatch)
  coordinator.enqueueToken('A');
  await wait(100); // Should not dispatch again
  expect(dispatchOrder.filter(t => t === 'A').length).toBe(1);

  // Wait for cooldown to expire, then enqueue again (should dispatch)
  await wait(300); // After cooldown
  coordinator.enqueueToken('A');
  await wait(200);
  expect(dispatchOrder.filter(t => t === 'A').length).toBe(2);
});
