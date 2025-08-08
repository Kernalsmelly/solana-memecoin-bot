import { describe, it, expect, vi } from 'vitest';
import { StrategyCoordinator } from '../src/strategies/strategyCoordinator';

function mockStrategy(name: string, patternMatchTokens: string[]) {
  return {
    name,
    enabled: true,
    cooldownSec: 0,
    handleOHLCV: vi.fn(async function (event: any) {
      if (patternMatchTokens.includes(event.tokenSymbol)) {
        this.emit &&
          this.emit('patternMatch', {
            address: event.tokenSymbol,
            timestamp: event.timestamp,
            strategy: name,
            suggestedSOL: 1,
          });
      }
    }),
    on: vi.fn(),
    emit: vi.fn(),
  };
}

describe('StrategyCoordinator ensemble integration', () => {
  it('dispatches concurrent pattern matches with no token overlap and correct weighting', async () => {
    const stratA = mockStrategy('volatilitySqueeze', ['AAA', 'BBB']);
    const stratB = mockStrategy('momentumBreakout', ['CCC', 'DDD']);
    const coordinator = new StrategyCoordinator({
      strategies: [stratA, stratB],
      enabledStrategies: ['volatilitySqueeze', 'momentumBreakout'],
      stratWeightsInterval: 2,
    });
    // Simulate both strategies firing on different tokens concurrently
    const events = [
      { tokenSymbol: 'AAA', timestamp: Date.now() },
      { tokenSymbol: 'CCC', timestamp: Date.now() },
    ];
    await Promise.all(events.map((e) => coordinator.handleOHLCV(e)));
    // No overlap: stratA only triggers for AAA/BBB, stratB for CCC/DDD
    expect(stratA.handleOHLCV).toHaveBeenCalledWith(events[0]);
    expect(stratB.handleOHLCV).toHaveBeenCalledWith(events[1]);
    // Weighted round-robin: highest weight first
    coordinator.setStrategyWeight('volatilitySqueeze', 2);
    coordinator.setStrategyWeight('momentumBreakout', 1);
    const order = coordinator.getWeightedStrategyOrder();
    expect(order[0]).toBe('volatilitySqueeze');
    expect(order[1]).toBe('momentumBreakout');
  });
});
