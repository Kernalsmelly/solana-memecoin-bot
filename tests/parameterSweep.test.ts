import { describe, it, expect, vi } from 'vitest';
import { ParameterSweepManager } from '../src/strategy/ParameterSweepManager';

const combos = [
  { stopLossPct: 1, takeProfitPct: 2, riskPct: 0.01 },
  { stopLossPct: 2, takeProfitPct: 2, riskPct: 0.01 },
  { stopLossPct: 1, takeProfitPct: 3, riskPct: 0.005 },
];

const fakePnL = {
  '1-2-0.01': [1, 1, 1],
  '2-2-0.01': [-1, -1, -1],
  '1-3-0.005': [2, 2, 2],
};

function mockSimulate(params: any, n: number) {
  const k = `${params.stopLossPct}-${params.takeProfitPct}-${params.riskPct}`;
  return Promise.resolve(fakePnL[k] || Array(n).fill(0));
}

describe('ParameterSweepManager.runSweepFromEnv', () => {
  it('selects the best param combo by netPnL', async () => {
    process.env.SWEEP_STOP_LOSS_RANGE = '1,2';
    process.env.SWEEP_TAKE_PROFIT_RANGE = '2,3';
    process.env.SWEEP_RISK_PCT_RANGE = '0.01,0.005';
    process.env.SWEEP_TRADES_PER_COMBO = '3';
    const { bestParams, bestStats, allResults } = await ParameterSweepManager.runSweepFromEnv(
      3,
      mockSimulate,
    );
    expect(bestParams).toEqual({ stopLossPct: 1, takeProfitPct: 3, riskPct: 0.005 });
    expect(bestStats.totalPnL).toBe(6);
    expect(allResults.length).toBe(8);
  });
});
