import { SweepParams } from '../strategy/ParameterSweepManager.js';

/**
 * Simulates n trades for a given parameter set. Replace this stub with real dry-run pipeline logic.
 * Returns an array of PnL numbers (one per trade).
 */
export async function simulateSweepTrades(params: any, n: number): Promise<number[]> {
  // TODO: Integrate with real dry-run pipeline. For now, return random PnL values for each trade.
  return Array.from({ length: n }, () => {
    // Simulate PnL as a function of param values for mock testing
    const base = (params.stopLossPct || 1) + (params.takeProfitPct || 1) + (params.riskPct || 0);
    return (Math.random() - 0.5) * base * 0.5; // Range: ~[-base/2, base/2]
  });
}
