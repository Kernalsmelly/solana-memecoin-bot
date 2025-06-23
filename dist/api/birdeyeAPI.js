"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BirdeyeAPI = void 0;
const events_1 = __importDefault(require("events"));
/**
 * BirdeyeAPI provides REST access to Birdeye premium endpoints for token metadata and price.
 * All usage is gated behind the USE_PREMIUM_DATA environment variable.
 * When premium data is disabled, mock data is returned for interface compatibility.
 */
class BirdeyeAPI extends events_1.default {
    /**
     * Connect to Birdeye WebSocket (stub).
     */
    async connectWebSocket(_channels) {
        console.log('[BirdeyeAPI] connectWebSocket: TODO - not implemented.');
        return false;
    }
    key;
    usePremium;
    _pingId;
    constructor(apiKey) {
        super();
        this.key = apiKey;
        this.usePremium = process.env.USE_PREMIUM_DATA === 'true';
        if (this.usePremium) {
            // Register global rate limiter if present (pseudo-code)
            // globalRateLimiter.registerLimit('birdeye', { rps: 1 });
            // Maintain a ping interval to keep any session alive if needed
            this._pingId = setInterval(() => { }, 30000);
        }
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
exports.BirdeyeAPI = BirdeyeAPI;
/**
 * Optionally, export a default instance or factory if needed by the rest of the codebase.
 */
exports.default = BirdeyeAPI;
//# sourceMappingURL=birdeyeAPI.js.map