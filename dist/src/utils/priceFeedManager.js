"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceFeedManager = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./logger"));
class PriceFeedManager {
    rateLimiter;
    dexScreenerApiUrl;
    coingeckoApiUrl;
    lastRestFetch = new Map();
    restIntervalMs = 30000;
    constructor(options) {
        this.rateLimiter = options.rateLimiter;
        this.dexScreenerApiUrl = options.dexScreenerApiUrl || 'https://api.dexscreener.com/latest/dex/tokens/';
        this.coingeckoApiUrl = options.coingeckoApiUrl || 'https://api.coingecko.com/api/v3/coins/solana/contract/';
    }
    // Try to get price/volume from DexScreener
    async fetchDexScreener(address) {
        if (!(await this.rateLimiter.canMakeRequest('dexscreener')))
            return null;
        try {
            const url = this.dexScreenerApiUrl + address;
            const res = await axios_1.default.get(url);
            const d = res.data?.pairs?.[0];
            if (!d)
                return null;
            return {
                address,
                close: Number(d.priceUsd),
                volume: Number(d.volume24h),
                liquidity: Number(d.liquidity?.usd || 0),
                timestamp: Date.now()
            };
        }
        catch (e) {
            logger_1.default.debug('[DexScreener] REST fetch error', e);
            return null;
        }
    }
    // Try to get price from Coingecko
    async fetchCoingecko(address) {
        if (!(await this.rateLimiter.canMakeRequest('coingecko')))
            return null;
        try {
            const url = this.coingeckoApiUrl + address;
            const res = await axios_1.default.get(url);
            const d = res.data?.market_data;
            if (!d)
                return null;
            return {
                address,
                close: Number(d.current_price?.usd || 0),
                volume: Number(d.total_volume?.usd || 0),
                timestamp: Date.now()
            };
        }
        catch (e) {
            logger_1.default.debug('[Coingecko] REST fetch error', e);
            return null;
        }
    }
    // Main fallback fetcher (rotates REST sources, rate-limited)
    async fetchFallback(address) {
        const now = Date.now();
        if (this.lastRestFetch.get(address) && now - this.lastRestFetch.get(address) < this.restIntervalMs) {
            return null;
        }
        this.lastRestFetch.set(address, now);
        // Try DexScreener first, then Coingecko
        let ohlcv = await this.fetchDexScreener(address);
        if (!ohlcv) {
            ohlcv = await this.fetchCoingecko(address);
        }
        if (!ohlcv)
            return null;
        // Fill missing fields with defaults
        return {
            address,
            open: ohlcv.close || 0,
            high: ohlcv.close || 0,
            low: ohlcv.close || 0,
            close: ohlcv.close || 0,
            volume: ohlcv.volume || 0,
            timestamp: ohlcv.timestamp || now
        };
    }
}
exports.PriceFeedManager = PriceFeedManager;
//# sourceMappingURL=priceFeedManager.js.map