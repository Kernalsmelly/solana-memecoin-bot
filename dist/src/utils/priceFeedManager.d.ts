import { RateLimiter } from './rateLimiter.js';
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
    /**
     * Fetches or simulates a 30-minute OHLCV array (1-min bars) for the given mint address.
     * If no historical data API is available, uses the latest price/volume as a flat/mock series.
     */
    fetchRecentOHLCVSeries(mint: string, minutes?: number): Promise<OHLCVEvent[]>;
}
export {};
//# sourceMappingURL=priceFeedManager.d.ts.map