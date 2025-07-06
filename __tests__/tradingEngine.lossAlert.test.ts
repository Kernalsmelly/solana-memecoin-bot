import { describe, it, expect, vi } from 'vitest';
import { TradingEngine } from '../src/services/tradingEngine';

// Mock sendAlert
const alerts: string[] = [];
vi.mock('../src/services/alertManager', () => ({
  sendAlert: (msg: string) => alerts.push(msg)
}));

describe('TradingEngine consecutive-loss alert', () => {
  it('fires only after >=3 consecutive losses', async () => {
    const engine = new TradingEngine({} as any, {} as any, {} as any, {} as any);
    engine['consecutiveLosses'] = 2;
    alerts.length = 0;
    // Simulate a 3rd loss
    engine['consecutiveLosses']++;
    // Simulate drawdown far from threshold
    const drawdown = 0;
    const threshold = 10;
    // Patch alert and check
    await (engine as any).checkLossAlert(drawdown, threshold);
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toMatch(/3 consecutive losses/);
  });
});
