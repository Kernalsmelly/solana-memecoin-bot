import EventEmitter from 'events';
const POLL_INTERVAL = 10000; // 10 seconds
/**
 * BirdeyeAPI provides REST access to Birdeye premium endpoints for token metadata and price.
 * All usage is gated behind the USE_PREMIUM_DATA environment variable.
 * When premium data is disabled, mock data is returned for interface compatibility.
 */
export class BirdeyeAPI extends EventEmitter {
    /**
     * Connect to Birdeye WebSocket (stub for free tier).
     * For free tier, use REST polling fallback.
     * If WS is not implemented or fails, falls back to REST polling.
     * @param _channels Optionally subscribe to specific channels (ignored in REST mode)
     */
    async connectWebSocket(_channels = []) {
        if (this.usePremium) {
            // TODO: Implement premium WS logic here if/when available.
            console.warn('[BirdeyeAPI] Premium WebSocket not implemented. Falling back to REST polling.');
            this._startRestPolling();
            return false;
        }
        else {
            // Start REST polling for new pools (free tier)
            this._startRestPolling();
            return true;
        }
    }
    /**
     * Fetch the current price for a given token address (REST endpoint).
     * @param tokenAddress The token mint address (string)
     * @returns Promise<number | null> The current price, or null if unavailable
     */
    async fetchTokenPrice(tokenAddress) {
        const axios = require('axios');
        const API_URL = `https://public-api.birdeye.so/public/price?address=${tokenAddress}`;
        const headers = { 'X-API-KEY': this.key };
        try {
            const res = await axios.get(API_URL, { headers });
            return res.data?.data?.value ?? null;
        }
        catch (error) {
            console.error('[BirdeyeAPI] Error fetching token price:', error);
            return null;
        }
    }
    /**
     * Stop all polling and cleanup timers.
     */
    stop() {
        if (this._pollTimer)
            clearInterval(this._pollTimer);
        if (this._pingId)
            clearInterval(this._pingId);
        this._pollTimer = undefined;
        this._pingId = undefined;
    }
    key;
    usePremium;
    _pingId;
    _pollTimer;
    _seenPools = new Set();
    _pollInterval;
    constructor(apiKey, pollInterval = 5000) {
        super();
        this.key = apiKey;
        this.usePremium = process.env.USE_PREMIUM_DATA === 'true';
        this._pollInterval = pollInterval;
        if (this.usePremium) {
            // Register global rate limiter if present (pseudo-code)
            // globalRateLimiter.registerLimit('birdeye', { rps: 1 });
            // Maintain a ping interval to keep any session alive if needed
            this._pingId = setInterval(() => { }, 30000);
        }
    }
    /**
     * Start REST polling for new pools (free tier fallback).
     * Emits 'pool' events for new pools.
     */
    async _startRestPolling() {
        const axios = require('axios');
        const { globalRateLimiter } = require('../utils/rateLimiter');
        const API_URL = 'https://public-api.birdeye.so/public/pool/all?sort_by=created_at&sort_type=desc&offset=0&limit=20';
        const headers = { 'X-API-KEY': this.key };
        let errorCount = 0;
        let lastErrorLog = 0;
        const MAX_BACKOFF = 60000;
        const poll = async (backoff = 1000) => {
            try {
                if (globalRateLimiter && !(await globalRateLimiter.canMakeRequest('birdeye'))) {
                    setTimeout(() => poll(backoff), backoff);
                    return;
                }
                const res = await axios.get(API_URL, { headers });
                const pools = res.data?.data || [];
                for (const pool of pools) {
                    if (!this._seenPools.has(pool.address)) {
                        this._seenPools.add(pool.address);
                        this.emit('pool', pool);
                    }
                }
                errorCount = 0;
                lastErrorLog = 0;
                this._pollTimer = setTimeout(() => poll(POLL_INTERVAL), POLL_INTERVAL);
            }
            catch (e) {
                errorCount++;
                const now = Date.now();
                if (errorCount === 1 || errorCount % 10 === 0 || now - lastErrorLog > 300000) {
                    if (e instanceof Error) {
                        console.warn('[BirdeyeAPI] REST poll error:', e.message);
                    }
                    else {
                        console.warn('[BirdeyeAPI] REST poll error:', e);
                    }
                    lastErrorLog = now;
                }
                const nextBackoff = Math.min(MAX_BACKOFF, backoff * 2);
                this._pollTimer = setTimeout(() => poll(nextBackoff), nextBackoff);
            }
        };
        poll();
    }
    /**
     * Fetch token metadata from Birdeye. Returns mock data if premium is disabled.
     */
    async getTokenMetadata(address) {
        if (!this.usePremium) {
            // Deterministic mock for tests or CI
            return { address, name: 'Dummy', symbol: 'DUM', liquidity: 100000 }; // Mock $100k liquidity for CI/tests
        }
        // Implement actual API call here
        throw new Error('Birdeye API call not implemented.');
    }
    /**
     * Fetch token price from Birdeye. Returns mock data if premium is disabled.
     */
    async getTokenPrice(address) {
        if (!this.usePremium) {
            // Deterministic mock for tests or CI
            return { address, priceUsd: 0.01 };
        }
        // Implement actual API call here
        throw new Error('Birdeye API call not implemented.');
    }
    /**
     * Fetch the current SOL price in USD from Birdeye (or mock if premium is disabled).
     * Returns a number (price in USD).
     * When premium is off, returns a deterministic mock value for CI/test stability.
     */
    async getSolPrice() {
        if (!this.usePremium) {
            // Deterministic mock for tests or CI
            return 100; // Example mock SOL price
        }
        // Implement actual API call here
        throw new Error('Birdeye SOL price API call not implemented.');
    }
    /**
     * Clean up any resources. No-op if premium data is disabled.
     */
    close() {
        if (!this.usePremium)
            return;
        if (this._pingId)
            clearInterval(this._pingId);
        this.emit('close');
    }
    /**
     * Disconnect from Birdeye WebSocket or clean up resources (no-op for now).
     */
    disconnect() {
        // If premium, clean up resources. For now, just emit event for interface compatibility.
        if (this.usePremium && this._pingId) {
            clearInterval(this._pingId);
            this._pingId = undefined;
        }
        this.emit('disconnected');
    }
}
/**
 * Optionally, export a default instance or factory if needed by the rest of the codebase.
 */
export default BirdeyeAPI;
//# sourceMappingURL=birdeyeAPI.js.map