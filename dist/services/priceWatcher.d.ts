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
    signalReason?: string;
    symbol?: string;
    volume1h?: number;
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
    private rpcCallCount;
    private rpcCallResetTime;
    private readonly MAX_RPC_CALLS_PER_MINUTE;
    private jupiterCallCount;
    private jupiterCallResetTime;
    private readonly MAX_JUPITER_CALLS_PER_MINUTE;
    constructor(connection: Connection, config: Config);
    private cacheQuoteTokenDecimals;
    private getTokenDecimals;
    start(): void;
    stop(): void;
    watchToken(mintAddress: string, pairAddress?: string): void;
    unwatchToken(mintAddress: string): void;
    /**
     * Rate limiter for RPC calls to prevent excessive QuickNode usage
     * @returns true if the call is allowed, false if it should be throttled
     */
    private checkRpcRateLimit;
    /**
     * Rate limiter for Jupiter API calls
     * @returns true if the call is allowed, false if it should be throttled
     */
    private checkJupiterRateLimit;
    private pollWatchedTokens;
    private pollSingleToken;
    private fetchJupiterPrice;
    fetchDexscreenerData(queryAddress: string, type: 'pair' | 'token'): Promise<any>;
    private calculatePriceChange;
    private calculateBuyRatio;
    private calculateVolumeChangePercent;
    private trimHistory;
}
//# sourceMappingURL=priceWatcher.d.ts.map