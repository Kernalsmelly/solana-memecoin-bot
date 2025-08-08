import EventEmitter from 'events';
export interface SweepParams {
    priceChangeThreshold: number;
    volumeMultiplier: number;
}
export interface BatchPerformance {
    paramIndex: number;
    params: SweepParams;
    trades: number;
    totalPnL: number;
    sharpeLike: number;
}
export declare class ParameterSweepManager extends EventEmitter {
    /**
     * Runs a full parameter sweep using sweep ranges from .env, simulates trades, and returns the best params.
     * @param tradesCount Number of trades per combo
     * @param simulate Callback to simulate trades for given params (returns array of PnLs)
     */
    static runSweepFromEnv(tradesCount: number, simulate: (params: SweepParams, n: number) => Promise<number[]>): Promise<{
        bestParams: SweepParams;
        bestStats: BatchPerformance;
        allResults: BatchPerformance[];
    }>;
    private paramGrid;
    private batchSize;
    private batchResults;
    private currentBatch;
    constructor(paramGrid: SweepParams[], batchSize?: number);
    /** Get current parameters for the active batch */
    getCurrentParams(): SweepParams;
    /** Call after each trade to track PnL and maybe trigger batch rotation */
    recordTrade(pnl: number): void;
    private finishBatch;
    private rotateParams;
    /** For reporting */
    getHistory(): BatchPerformance[];
}
//# sourceMappingURL=ParameterSweepManager.d.ts.map