import EventEmitter from 'events';
/**
 * BirdeyeAPI provides REST access to Birdeye premium endpoints for token metadata and price.
 * All usage is gated behind the USE_PREMIUM_DATA environment variable.
 * When premium data is disabled, mock data is returned for interface compatibility.
 */
export declare class BirdeyeAPI extends EventEmitter {
    /**
     * Connect to Birdeye WebSocket (stub for free tier).
     * For free tier, use REST polling fallback.
     * If WS is not implemented or fails, falls back to REST polling.
     * @param _channels Optionally subscribe to specific channels (ignored in REST mode)
     */
    connectWebSocket(_channels?: string[]): Promise<boolean>;
    /**
     * Fetch the current price for a given token address (REST endpoint).
     * @param tokenAddress The token mint address (string)
     * @returns Promise<number | null> The current price, or null if unavailable
     */
    fetchTokenPrice(tokenAddress: string): Promise<number | null>;
    /**
     * Stop all polling and cleanup timers.
     */
    stop(): void;
    key: string;
    private usePremium;
    private _pingId?;
    private _pollTimer?;
    private _seenPools;
    private _pollInterval;
    constructor(apiKey: string, pollInterval?: number);
    /**
     * Start REST polling for new pools (free tier fallback).
     * Emits 'pool' events for new pools.
     */
    private _startRestPolling;
    /**
     * Fetch token metadata from Birdeye. Returns mock data if premium is disabled.
     */
    getTokenMetadata(address: string): Promise<{
        address: string;
        name: string;
        symbol: string;
        liquidity?: number;
    }>;
    /**
     * Fetch token price from Birdeye. Returns mock data if premium is disabled.
     */
    getTokenPrice(address: string): Promise<{
        address: string;
        priceUsd: number;
    }>;
    /**
     * Fetch the current SOL price in USD from Birdeye (or mock if premium is disabled).
     * Returns a number (price in USD).
     * When premium is off, returns a deterministic mock value for CI/test stability.
     */
    getSolPrice(): Promise<number>;
    /**
     * Clean up any resources. No-op if premium data is disabled.
     */
    close(): void;
    /**
     * Disconnect from Birdeye WebSocket or clean up resources (no-op for now).
     */
    disconnect(): void;
}
/**
 * Optionally, export a default instance or factory if needed by the rest of the codebase.
 */
export default BirdeyeAPI;
//# sourceMappingURL=birdeyeAPI.d.ts.map