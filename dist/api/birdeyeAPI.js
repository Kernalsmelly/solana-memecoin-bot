"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BirdeyeAPI = exports.globalRateLimiter = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const logger_1 = __importDefault(require("../utils/logger"));
const axios_1 = __importDefault(require("axios")); // Add axios for REST calls
const cache_1 = require("../utils/cache");
const memoryManager_1 = require("../utils/memoryManager");
// Simple rate limiter for testing
class SimpleRateLimiter {
    constructor(maxRequests = 60, windowMs = 60000) {
        this.limits = new Map();
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
    checkLimit(key) {
        const now = Date.now();
        const limit = this.limits.get(key);
        if (!limit)
            return true;
        if (now > limit.resetTime) {
            this.limits.delete(key);
            return true;
        }
        return limit.count < this.maxRequests;
    }
    incrementCount(key) {
        const now = Date.now();
        const limit = this.limits.get(key);
        if (!limit || now > limit.resetTime) {
            this.limits.set(key, {
                count: 1,
                resetTime: now + this.windowMs
            });
        }
        else {
            limit.count += 1;
        }
    }
}
// Define the global rate limiter
exports.globalRateLimiter = new SimpleRateLimiter();
// BirdeyeAPI class for WebSocket connection and token data
class BirdeyeAPI extends events_1.EventEmitter {
    constructor(apiKey, wsUrl = 'wss://public-api.birdeye.so/socket', rateLimiter = exports.globalRateLimiter) {
        super();
        this.wsClient = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectTimeoutMs = 2000;
        this.reconnectTimer = null;
        this.pingInterval = null;
        this.metadataCache = cache_1.globalCacheManager.getCache('tokenMetadata', {
            maxSize: 10000,
            ttl: 30 * 60 * 1000, // 30 minutes cache TTL
            onEvict: (key, value) => {
                logger_1.default.debug(`Token metadata evicted from cache: ${key}`);
            }
        });
        this.isReconnecting = false;
        this.lastCleanupTime = Date.now();
        this.cleanupIntervalMs = 10 * 60 * 1000; // 10 minutes
        this.solPriceCache = null;
        this.SOL_PRICE_CACHE_DURATION = 60 * 1000; // Cache SOL price for 60 seconds
        this.apiKey = apiKey;
        this.wsUrl = wsUrl;
        this.rateLimiter = rateLimiter;
        // Schedule cleanup to prevent memory leaks
        this.scheduleCleanup();
    }
    // Connect to WebSocket with automatic reconnection
    async connectWebSocket(subscriptions = ['newTokens', 'volumeSpikes']) {
        if (this.wsClient && this.wsClient.readyState === ws_1.default.OPEN) {
            logger_1.default.info('WebSocket already connected');
            return true;
        }
        if (this.isReconnecting) {
            logger_1.default.info('Reconnection already in progress');
            return false;
        }
        // Clean up any existing connection
        this.cleanup();
        try {
            logger_1.default.info('Connecting to Birdeye WebSocket...');
            // Create a new WebSocket connection
            this.wsClient = new ws_1.default(this.wsUrl);
            // Set up WebSocket event listeners
            this.wsClient.on('open', () => this.handleWsOpen(subscriptions));
            this.wsClient.on('message', (data) => this.handleWsMessage(data));
            this.wsClient.on('error', (error) => this.handleWsError(error));
            this.wsClient.on('close', (code, reason) => this.handleWsClose(code, reason, subscriptions));
            // Set up ping interval to keep connection alive
            this.pingInterval = setInterval(() => {
                if (this.wsClient && this.wsClient.readyState === ws_1.default.OPEN) {
                    this.wsClient.ping();
                }
            }, 30000); // Send ping every 30 seconds
            return true;
        }
        catch (error) {
            logger_1.default.error('Error connecting to WebSocket', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            this.attemptReconnect(subscriptions);
            return false;
        }
    }
    // Handle WebSocket open event
    handleWsOpen(subscriptions) {
        logger_1.default.info('Connected to Birdeye WebSocket');
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        // Subscribe to each topic
        subscriptions.forEach(topic => {
            if (this.wsClient && this.wsClient.readyState === ws_1.default.OPEN) {
                const subscribeMessage = JSON.stringify({
                    type: 'subscribe',
                    topic,
                    apiKey: this.apiKey
                });
                this.wsClient.send(subscribeMessage);
                logger_1.default.info(`Subscribed to ${topic}`);
            }
        });
        this.emit('connected');
    }
    // Handle WebSocket messages
    handleWsMessage(data) {
        try {
            // Check if the data is a Buffer or string
            const messageStr = Buffer.isBuffer(data) ? data.toString() : String(data);
            const message = JSON.parse(messageStr);
            // Handle different message types
            if (message.type === 'newToken' || message.type === 'volumeSpike') {
                const tokenEvent = {
                    type: message.type,
                    data: message.data
                };
                // Cache token metadata
                this.metadataCache.set(message.data.address, message.data);
                // Emit the token event
                this.emit('tokenEvent', tokenEvent);
            }
            else if (message.type === 'subscribed') {
                logger_1.default.info(`Successfully subscribed to ${message.topic}`);
            }
            else if (message.type === 'error') {
                logger_1.default.error('WebSocket error message', { message: message.message });
            }
        }
        catch (error) {
            logger_1.default.error('Error parsing WebSocket message', {
                error: error instanceof Error ? error.message : 'Unknown error',
                data: typeof data === 'string' ? data.substring(0, 100) : 'non-string data'
            });
        }
    }
    // Handle WebSocket errors
    handleWsError(error) {
        logger_1.default.error('WebSocket error', {
            error: error.message
        });
        this.emit('error', error);
    }
    // Handle WebSocket close event
    handleWsClose(code, reason, subscriptions) {
        const reasonStr = Buffer.isBuffer(reason) ? reason.toString() : String(reason);
        logger_1.default.info(`WebSocket closed: Code ${code}${reasonStr ? `, Reason: ${reasonStr}` : ''}`);
        this.emit('disconnected', { code, reason: reasonStr });
        // Attempt to reconnect unless this was a deliberate closure
        if (code !== 1000 && code !== 1001) {
            this.attemptReconnect(subscriptions);
        }
    }
    // Attempt to reconnect to WebSocket
    attemptReconnect(subscriptions) {
        if (this.isReconnecting)
            return;
        this.isReconnecting = true;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger_1.default.error('Maximum reconnection attempts reached');
            this.emit('reconnectFailed');
            this.isReconnecting = false;
            return;
        }
        this.reconnectAttempts++;
        // Calculate exponential backoff with jitter
        const backoff = Math.min(30000, // Max 30 seconds
        this.reconnectTimeoutMs * Math.pow(1.5, this.reconnectAttempts - 1));
        const jitter = Math.random() * 1000; // Add up to 1 second of jitter
        const delay = backoff + jitter;
        logger_1.default.info(`Attempting to reconnect in ${Math.round(delay / 1000)} seconds (attempt ${this.reconnectAttempts})`);
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(() => {
            logger_1.default.info('Reconnecting to WebSocket...');
            this.connectWebSocket(subscriptions);
        }, delay);
    }
    // Disconnect WebSocket and clean up resources
    disconnect() {
        logger_1.default.info('Disconnecting from Birdeye WebSocket');
        this.cleanup();
        this.emit('disconnected', { code: 1000, reason: 'Disconnect requested' });
    }
    // Clean up all resources
    cleanup() {
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        // Clear ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        // Close WebSocket if open
        if (this.wsClient) {
            if (this.wsClient.readyState === ws_1.default.OPEN) {
                this.wsClient.terminate();
            }
            this.wsClient.removeAllListeners();
            this.wsClient = null;
        }
        this.isReconnecting = false;
    }
    // Get token metadata (from cache or API)
    async getTokenMetadata(address) {
        // Check cache first
        const cachedData = this.metadataCache.get(address);
        if (cachedData) {
            return cachedData;
        }
        // Rate limit check
        if (!this.rateLimiter.checkLimit(`tokenMetadata:${address}`)) {
            logger_1.default.warn('Rate limit exceeded for token metadata request', { address });
            return null;
        }
        // Increment rate limit counter
        this.rateLimiter.incrementCount(`tokenMetadata:${address}`);
        try {
            // Simulate API call for testing
            logger_1.default.info(`Fetching metadata for token ${address}`);
            // Return placeholder data for testing
            const metadata = {
                address,
                symbol: `TOKEN-${address.substring(0, 4)}`,
                name: `Test Token ${address.substring(0, 4)}`,
                decimals: 9,
                liquidity: Math.random() * 10000,
                volume: Math.random() * 5000,
                price: Math.random() * 0.01,
                createdAt: Date.now() - Math.random() * 1000000
            };
            // Cache the result
            this.metadataCache.set(address, metadata);
            return metadata;
        }
        catch (error) {
            logger_1.default.error('Error fetching token metadata', {
                error: error instanceof Error ? error.message : 'Unknown error',
                address
            });
            return null;
        }
    }
    // Method to fetch token price via REST API (for latency check etc.)
    async fetchTokenPrice(tokenAddress) {
        const url = `https://public-api.birdeye.so/public/price?address=${tokenAddress}`;
        logger_1.default.debug(`Fetching price from Birdeye REST API: ${url}`);
        try {
            const response = await axios_1.default.get(url, {
                headers: {
                    'X-API-KEY': this.apiKey, // Use the class API key
                    'Accept': 'application/json'
                },
                timeout: 5000 // Set a timeout for the request
            });
            if (response.data && response.data.data && typeof response.data.data.value === 'number') {
                logger_1.default.debug(`Price received for ${tokenAddress}: ${response.data.data.value}`);
                return response.data.data.value;
            }
            logger_1.default.warn('Invalid price data format received from Birdeye', { address: tokenAddress, data: response.data });
            return null;
        }
        catch (error) {
            logger_1.default.error(`Error fetching token price from Birdeye for ${tokenAddress}`, {
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }
    // Fetches the current price of SOL in USD.
    // Uses caching to avoid excessive API calls.
    async getSolPrice() {
        const now = Date.now();
        // Check cache first
        if (this.solPriceCache && (now - this.solPriceCache.timestamp < this.SOL_PRICE_CACHE_DURATION)) {
            logger_1.default.debug('Returning cached SOL price', { price: this.solPriceCache.price });
            return this.solPriceCache.price;
        }
        logger_1.default.info('Fetching fresh SOL price from Birdeye...');
        const endpoint = `https://public-api.birdeye.so/public/price?address=${'So11111111111111111111111111111111111111112'}`;
        try {
            const response = await axios_1.default.get(endpoint, {
                headers: {
                    'X-API-KEY': this.apiKey
                }
            });
            if (response.data && response.data.data && typeof response.data.data.value === 'number') {
                const price = response.data.data.value;
                // Update cache
                this.solPriceCache = { price, timestamp: now };
                logger_1.default.info('Successfully fetched SOL price', { price });
                return price;
            }
            else {
                logger_1.default.warn('Birdeye SOL price response format unexpected', { responseData: response.data });
                throw new Error('Invalid data format in Birdeye SOL price response');
            }
        }
        catch (error) {
            logger_1.default.error('Failed to fetch SOL price from Birdeye', error);
            // If cache exists but is stale, return stale price as fallback?
            if (this.solPriceCache) {
                logger_1.default.warn('Returning stale SOL price due to fetch error', { price: this.solPriceCache.price });
                return this.solPriceCache.price;
            }
            throw error; // Re-throw if no cache available
        }
    }
    // Schedule periodic cleanup to prevent memory leaks
    scheduleCleanup() {
        setInterval(() => {
            const now = Date.now();
            if (now - this.lastCleanupTime >= this.cleanupIntervalMs) {
                this.performCleanup();
                this.lastCleanupTime = now;
            }
        }, 60000); // Check every minute
    }
    // Perform cleanup operations
    performCleanup() {
        // Run cache cleanup
        const cleanedCount = this.metadataCache.cleanup();
        if (cleanedCount > 0) {
            logger_1.default.info(`Cleaned up ${cleanedCount} expired token metadata entries`);
        }
        // Run garbage collection if available
        memoryManager_1.memoryManager.triggerGarbageCollection();
    }
}
exports.BirdeyeAPI = BirdeyeAPI;
