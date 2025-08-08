export interface FeedbackTrade {
    priceChangeThreshold: number;
    volumeMultiplier: number;
    pnl: number;
    win: boolean;
    drawdown: number;
    fees: number;
    slippage: number;
}
export interface FeedbackParams {
    priceChangeThreshold: number;
    volumeMultiplier: number;
}
export interface FeedbackStats {
    tradeCount: number;
    winRate: number;
    netPnl: number;
    maxDrawdown: number;
}
export declare class ParameterFeedbackLoop {
    private batchSize;
    private deltaPct;
    private tradeBuffer;
    private lastParams;
    private onUpdate;
    constructor(initialParams: FeedbackParams, onUpdate: (params: FeedbackParams, stats: FeedbackStats) => void, batchSize?: number, deltaPct?: number);
    addTrade(trade: FeedbackTrade): void;
    private runSweep;
    private simulate;
}
//# sourceMappingURL=parameterFeedbackLoop.d.ts.map