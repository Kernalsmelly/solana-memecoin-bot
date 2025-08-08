import { ParameterSweepManager } from '../src/strategy/ParameterSweepManager.js';
import { updateLiveParams, emitParameterUpdateEvent, incrementParameterUpdateMetric, } from '../src/utils/selfTuning.js';
import { simulateSweepTrades } from '../src/utils/simulateSweepTrades.js';
import dotenv from 'dotenv';
dotenv.config();
async function main() {
    const tradesPerCombo = Number(process.env.SWEEP_TRADES_PER_COMBO) || 3;
    // Run sweep using dry-run simulation for each param combo
    const { bestParams, bestStats, allResults } = await ParameterSweepManager.runSweepFromEnv(tradesPerCombo, simulateSweepTrades);
    // Auto-apply best params in-memory
    updateLiveParams(bestParams);
    emitParameterUpdateEvent(bestParams);
    incrementParameterUpdateMetric();
    // Log best params
    console.log('✅ Devnet sweep complete. Best params:', bestParams);
    console.log('Sweep stats:', bestStats);
    console.log('All results:', allResults);
}
main().catch((err) => {
    console.error('Sweep failed:', err);
    process.exit(1);
});
//# sourceMappingURL=devnet-sweep.js.map