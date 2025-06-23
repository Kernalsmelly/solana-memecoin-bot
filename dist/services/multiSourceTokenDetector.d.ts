import EventEmitter from 'events';
export interface MultiSourceTokenEvent {
    mint: string;
    symbol?: string;
    poolAddress?: string;
    source: 'birdeye' | 'jupiter' | 'dexscreener';
    metrics?: import('../types').TokenMetrics;
    extra?: any;
}
export declare class MultiSourceTokenDetector extends EventEmitter {
    private birdeyeSocket;
    private readonly birdeyeUrl;
    private readonly jupiterUrl;
    private readonly dexscreenerUrl;
    private readonly pollIntervalMs;
    private watchedMints;
    constructor();
    private startBirdeye;
    private startPolling;
    private pollJupiter;
    private pollDexscreener;
}
//# sourceMappingURL=multiSourceTokenDetector.d.ts.map