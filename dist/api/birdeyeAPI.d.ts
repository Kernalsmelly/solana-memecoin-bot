import { EventEmitter } from 'events';
import { BirdeyeTokenData } from '../analysis/tokenAnalyzer';
interface RateLimiter {
    checkLimit(key: string): boolean;
    incrementCount(key: string): void;
}
declare class SimpleRateLimiter implements RateLimiter {
    private limits;
    private maxRequests;
    private windowMs;
    constructor(maxRequests?: number, windowMs?: number);
    checkLimit(key: string): boolean;
    incrementCount(key: string): void;
}
export declare const globalRateLimiter: SimpleRateLimiter;
export interface TokenEvent {
    type: string;
    data: BirdeyeTokenData;
}
export declare class BirdeyeAPI extends EventEmitter {
    private wsUrl;
    private apiKey;
    private wsClient;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectTimeoutMs;
    private reconnectTimer;
    private pingInterval;
    private metadataCache;
    private rateLimiter;
    private isReconnecting;
    private lastCleanupTime;
    private cleanupIntervalMs;
    private solPriceCache;
    private readonly SOL_PRICE_CACHE_DURATION;
    constructor(apiKey: string, wsUrl?: string, rateLimiter?: RateLimiter);
    connectWebSocket(subscriptions?: string[]): Promise<boolean>;
    private handleWsOpen;
    private handleWsMessage;
    private handleWsError;
    private handleWsClose;
    private attemptReconnect;
    disconnect(): void;
    private cleanup;
    getTokenMetadata(address: string): Promise<BirdeyeTokenData | null>;
    fetchTokenPrice(tokenAddress: string): Promise<number | null>;
    getSolPrice(): Promise<number>;
    private scheduleCleanup;
    private performCleanup;
}
export {};
//# sourceMappingURL=birdeyeAPI.d.ts.map