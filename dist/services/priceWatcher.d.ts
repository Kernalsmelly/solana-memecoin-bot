import { Connection } from '@solana/web3.js';
import { Config } from '../utils/config';
import { EventEmitter } from 'events';
export interface MarketDataUpdateEvent {
    mint: string;
    pairAddress?: string;
    decimals: number;
    currentPrice: number;
    priceChangePercent?: number;
    priceChange1m?: number;
    volume5m?: number;
    volumeChange1h?: number;
    liquidity: number;
    buyRatio5m?: number;
    pairCreatedAt?: number;
    volumeChangePercent?: number;
}
export declare class PriceWatcher extends EventEmitter {
    private connection;
    private config;
    private jupiterApi;
    private watchedTokens;
    private tokenDecimalsCache;
    private pollIntervalId;
    private pollIntervalMs;
    private maxPollingErrors;
    constructor(connection: Connection, config: Config);
    private cacheQuoteTokenDecimals;
    private getTokenDecimals;
    start(): void;
    stop(): void;
    watchToken(mintAddress: string, pairAddress?: string): void;
    unwatchToken(mintAddress: string): void;
    private pollWatchedTokens;
    private pollSingleToken;
    private fetchJupiterPrice;
    private fetchDexscreenerData;
    private calculatePriceChange;
    private calculateBuyRatio;
    private calculateVolumeChangePercent;
    private trimHistory;
}
//# sourceMappingURL=priceWatcher.d.ts.map