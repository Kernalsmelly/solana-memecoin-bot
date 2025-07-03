import { RateLimiter } from './rateLimiter';
export interface OHLCVEvent {
    address: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: number;
}
interface PriceFeedManagerOptions {
    rateLimiter: RateLimiter;
    dexScreenerApiUrl?: string;
    coingeckoApiUrl?: string;
}
export declare class PriceFeedManager {
    private rateLimiter;
    private dexScreenerApiUrl;
    private coingeckoApiUrl;
    private lastRestFetch;
    private restIntervalMs;
    constructor(options: PriceFeedManagerOptions);
    fetchDexScreener(address: string): Promise<Partial<OHLCVEvent> | null>;
    fetchCoingecko(address: string): Promise<Partial<OHLCVEvent> | null>;
    fetchFallback(address: string): Promise<OHLCVEvent | null>;
}
export {};
//# sourceMappingURL=priceFeedManager.d.ts.map