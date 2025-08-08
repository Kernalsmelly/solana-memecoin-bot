// Using Vitest fake timers to stabilize concurrency/cooldown tests
import { StrategyCoordinator } from '../../strategy/StrategyCoordinator';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});
test('StrategyCoordinator concurrency & cooldown', async () => {
    const coordinator = new StrategyCoordinator({ maxConcurrent: 3, cooldownMs: 300 }); // 300ms cooldown for test
    const tokens = ['A', 'B', 'C', 'D', 'E'];
    const active = new Set();
    const dispatchOrder = [];
    let overlapDetected = false;
    coordinator.on('tokenDispatch', (token) => {
        dispatchOrder.push(token);
        if (active.has(token))
            overlapDetected = true;
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
    // Explicitly complete 'A', then immediately enqueue 'A' during cooldown
    coordinator.completeToken('A');
    coordinator.enqueueToken('A');
    vi.advanceTimersByTime(100); // Only 100ms into cooldown, should not dispatch again
    expect(dispatchOrder.filter((t) => t === 'A').length).toBe(1);
    // Advance time to just before cooldown expires
    vi.advanceTimersByTime(199); // Still not enough for cooldown
    expect(dispatchOrder.filter((t) => t === 'A').length).toBe(1);
    // Wait for cooldown to expire
    vi.advanceTimersByTime(1); // Now cooldown is over, should dispatch
    expect(dispatchOrder.filter((t) => t === 'A').length).toBe(2);
});
//# sourceMappingURL=strategyCoordinatorConcurrency.test.js.map