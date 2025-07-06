import EventEmitter from 'events';
export interface ParamConfig {
    priceChangeThreshold: number;
    volumeMultiplier: number;
}
export interface ParameterUpdateEvent {
    newParams: ParamConfig;
    stats: SweepStats;
}
export interface SweepStats {
    trades: number;
    winRate: number;
    avgPnL: number;
    maxDrawdown: number;
}
export declare class ParameterFeedbackLoop extends EventEmitter {
    private tradeBuffer;
    private bufferSize;
    private sweepInterval;
    private currentParams;
    private tradeLogPath;
    private tradeCount;
    constructor(initialParams: ParamConfig, tradeLogPath: string, bufferSize?: number, sweepInterval?: number);
    onTrade(trade: any): void;
    private runSweep;
    private generateParamGrid;
    private evaluateParams;
    loadRecentTrades(): void;
}
//# sourceMappingURL=ParameterFeedbackLoop.d.ts.map