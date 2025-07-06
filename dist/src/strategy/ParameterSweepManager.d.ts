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
/**
 * Manages parameter sweeps, batch assignment, and performance tracking
 */
export declare class ParameterSweepManager extends EventEmitter {
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