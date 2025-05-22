import { EventEmitter } from 'events';
export interface LivePricePoint {
    price: number;
    volume: number;
    timestamp: number;
    buyRatio?: number;
}
export declare class LivePriceFeed extends EventEmitter {
    private lastVolume;
    private lastPrice;
    private tokenAddress;
    private timer;
    constructor(tokenAddress: string);
    start(): Promise<void>;
    stop(): void;
    private tryDexscreener;
    private tryCoingecko;
    private tryOrca;
    private getCoingeckoId;
    private fetchPriceData;
}
//# sourceMappingURL=livePriceFeed.d.ts.map