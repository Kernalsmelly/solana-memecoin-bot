import { EventEmitter } from 'events';
import { RpcRotator } from '../integrations/data-hub/RpcRotator.js';
import { TokenAnalyzer } from '../analysis/tokenAnalyzer.js';
import logger from '../utils/logger.js';
import { MemoryManager } from '../utils/memoryManager.js';
import { fetchHeliusTokenMetadata } from '../api/heliusAPI.js';
import { mockTokenDiscovery } from '../utils/mockTokenDiscovery.js';
import { LRUCache } from '../utils/cache.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import WebSocket from 'ws';
// Token discovery class for processing token events
export class TokenDiscovery extends EventEmitter {
    rpcRotator;
    tokenAnalyzer;
    riskManager;
    tokensDiscovered = new Map();
    tokenProcessQueue = new Map();
    tokenExpiryTimes = new Map();
    cleanupInterval = null;
    processingQueue = false;
    lastAnalysisTime = 0;
    // Birdeye API integration
    birdeyeAPI;
    seenPoolAddresses = new Set();
    // Configuration
    MIN_LIQUIDITY;
    MIN_VOLUME;
    CLEANUP_INTERVAL_MS;
    TOKEN_MAX_AGE_MS;
    ANALYSIS_THROTTLE_MS;
    BLACKLIST;
    useMockDiscovery = false;
    tokenCache = new LRUCache({
        maxSize: 1000,
        ttl: 60 * 60 * 1000,
    }); // 1 hour TTL
    rateLimiter = new RateLimiter();
    ws = null;
    wsBackoff = 1000;
    wsConnected = false;
    constructor(options = {}, riskManager) {
        super();
        this.rpcRotator = new RpcRotator();
        this.riskManager = riskManager;
        // Hybrid logic: use mock discovery if no Birdeye/Helius API key
        // Use env var for min liquidity if present
        const envMinLiq = process.env.MIN_LIQUIDITY_USD
            ? Number(process.env.MIN_LIQUIDITY_USD)
            : undefined;
        const minLiquidity = envMinLiq || options.minLiquidity || 10000;
        this.MIN_LIQUIDITY = minLiquidity;
        // Use mock discovery ONLY if not mainnet/live mode
        this.useMockDiscovery =
            !process.env.BIRDEYE_API_KEY &&
                !process.env.HELIUS_API_KEY &&
                process.env.LIVE_MODE !== 'true' &&
                process.env.NETWORK !== 'mainnet';
        if (this.useMockDiscovery) {
            logger.warn('[TokenDiscovery] No API key found, using mock token discovery.');
            mockTokenDiscovery.on('tokenDiscovered', (token) => {
                // Forward as BirdeyeTokenData shape for compatibility
                const birdeyeToken = {
                    address: token.address,
                    symbol: token.symbol,
                    name: token.name,
                    decimals: token.decimals,
                    price: 0.00001 + Math.random() * 0.01,
                    liquidity: token.liquidity,
                    volume: Math.floor(Math.random() * 100000),
                    createdAt: token.createdAt,
                    // Add other fields as needed for downstream compatibility
                };
                this.emit('tokenDiscovered', birdeyeToken);
            });
            mockTokenDiscovery.start(30000); // Emit every 30s
        }
        // Initialize token analyzer
        this.tokenAnalyzer = new TokenAnalyzer({
            minLiquidity: minLiquidity,
            minHolders: 10, // Default
        });
        // Set configuration options with defaults
        this.MIN_LIQUIDITY = minLiquidity;
        this.MIN_VOLUME = options.minVolume || 500;
        this.CLEANUP_INTERVAL_MS = options.cleanupIntervalMs || 5 * 60 * 1000; // 5 minutes
        this.TOKEN_MAX_AGE_MS = options.maxTokenAge || 24 * 60 * 60 * 1000; // 24 hours
        this.ANALYSIS_THROTTLE_MS = options.analysisThrottleMs || 100; // 100ms throttle
        this.BLACKLIST = new Set(options.blacklist || []);
        // TODO: Allow dynamic update of blacklist from user config or external source
        // Start cleanup interval
        this.startCleanupInterval();
        // Fallback: If no real token discovered in X seconds, emit TEST_TARGET_TOKEN
        const fallbackSecs = process.env.TOKEN_DISCOVERY_FALLBACK_SECS
            ? Number(process.env.TOKEN_DISCOVERY_FALLBACK_SECS)
            : 60;
        const testTargetToken = process.env.TEST_TARGET_TOKEN;
        if (testTargetToken) {
            setTimeout(() => {
                if (this.tokensDiscovered.size === 0) {
                    logger.warn(`[TokenDiscovery] No real tokens found after ${fallbackSecs}s, emitting TEST_TARGET_TOKEN`);
                    this.emit('tokenDiscovered', {
                        address: testTargetToken,
                        symbol: 'TEST',
                        name: 'Test Token',
                        decimals: 9,
                        liquidity: 999999,
                        volume: 99999,
                        price: 1,
                        createdAt: Date.now(),
                    });
                }
            }, fallbackSecs * 1000);
        }
    }
    // Start token discovery
    async start() {
        logger.info('TokenDiscovery started');
        const birdeyeWSUrl = 'wss://token-price.birdeye.so';
        const heliusApiKey = process.env.HELIUS_API_KEY;
        let reconnectAttempts = 0;
        const connectWS = () => {
            if (this.ws) {
                try {
                    this.ws.close();
                }
                catch { }
                this.ws = null;
            }
            logger.info(`[TokenDiscovery] Connecting to Birdeye WS...`);
            this.ws = new WebSocket(birdeyeWSUrl);
            this.wsConnected = false;
            this.ws.on('open', () => {
                logger.info('[TokenDiscovery] Birdeye WS connected');
                this.wsConnected = true;
                this.wsBackoff = 1000;
                reconnectAttempts = 0;
            });
            this.ws.on('message', async (data) => {
                try {
                    const event = JSON.parse(data.toString());
                    if (!event.address)
                        return;
                    // LRU cache check
                    const cached = this.tokenCache.get(event.address);
                    if (cached) {
                        this.emit('tokenDiscovered', cached);
                        return;
                    }
                    // Try to build BirdeyeTokenData from event
                    let token = {
                        address: event.address,
                        symbol: event.symbol || '',
                        name: event.name || '',
                        decimals: event.decimals || 9,
                        liquidity: event.liquidityUsd || event.liquidity || 0,
                        volume: event.volumeUsd24h || event.volume || 0,
                        price: event.priceUsd || event.price || 0,
                        createdAt: event.createdAt || Date.now(),
                    };
                    // If missing symbol/name/decimals, try Helius fallback
                    if ((!token.symbol || !token.name || !token.decimals) && heliusApiKey) {
                        if (await this.rateLimiter.canMakeRequest('helius')) {
                            const heliusMeta = await fetchHeliusTokenMetadata(token.address, heliusApiKey);
                            if (heliusMeta) {
                                token = { ...token, ...heliusMeta };
                            }
                        }
                    }
                    this.tokenCache.set(token.address, token);
                    this.emit('tokenDiscovered', token);
                }
                catch (err) {
                    logger.debug('[TokenDiscovery] WS event parse error', err);
                }
            });
            this.ws.on('close', () => {
                logger.warn('[TokenDiscovery] Birdeye WS closed, will reconnect');
                this.wsConnected = false;
                reconnectAttempts++;
                setTimeout(connectWS, Math.min(60000, this.wsBackoff * Math.pow(2, reconnectAttempts)));
            });
            this.ws.on('error', (err) => {
                logger.debug('[TokenDiscovery] Birdeye WS error', err);
                if (!this.wsConnected) {
                    this.ws?.close();
                }
            });
        };
        connectWS();
        // --- Raydium Pool-Init Listener (fast path) ---
        // Raydium AMM program v4 mainnet: 5quB4rL6Aq6T1vQGZyQxkQxwJ5u1VvQwQwQwQwQwQwQw
        // (Use real program ID in production)
        const raydiumProgramId = '5quB4rL6Aq6T1vQGZyQxkQxwJ5u1VvQwQwQwQwQwQwQw';
        const raydiumWS = new WebSocket('wss://api.mainnet-beta.solana.com');
        raydiumWS.on('open', () => {
            // Subscribe to logs for Raydium program
            raydiumWS.send(JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'logsSubscribe',
                params: [{ mentions: [raydiumProgramId] }, { commitment: 'confirmed' }],
            }));
        });
        raydiumWS.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                const logs = msg?.params?.result?.value?.logs || [];
                // Look for pool-init keywords
                if (logs.some((l) => l.includes('InitializePool') || l.includes('AddLiquidity'))) {
                    const signature = msg?.params?.result?.value?.signature || '';
                    // Minimal pool info for now
                    const event = {
                        address: signature,
                        symbol: 'RAYDIUM_POOL',
                        name: 'Raydium Pool',
                        decimals: 9,
                        liquidity: 0,
                        volume: 0,
                        price: 0,
                        createdAt: Date.now(),
                    };
                    this.emit('tokenDiscovered', event);
                    logger.info('[Raydium] Pool-init detected', { signature });
                }
            }
            catch { }
        });
        return true;
    }
    // Filter pools by liquidity, volume, market cap, age, and blacklist
    filterPool(pool) {
        if (!pool) {
            logger.debug('Rejected pool: missing pool object');
            return false;
        }
        if (this.seenPoolAddresses.has(pool.address)) {
            logger.debug('Rejected pool: already seen', { address: pool.address });
            return false;
        }
        if (this.BLACKLIST.has(pool.address)) {
            logger.info('Rejected pool: blacklisted', { address: pool.address });
            return false;
        }
        const liquidity = pool.liquidityUsd ?? pool.liquidity ?? 0;
        if (liquidity < this.MIN_LIQUIDITY) {
            logger.debug('Rejected pool: insufficient liquidity', { address: pool.address, liquidity });
            return false;
        }
        const volume = pool.volumeUsd24h ?? pool.volume ?? 0;
        if (volume < this.MIN_VOLUME) {
            logger.debug('Rejected pool: insufficient volume', { address: pool.address, volume });
            return false;
        }
        const mcap = pool.mcapUsd ?? pool.mcap ?? 0;
        if (mcap > 50000) {
            logger.debug('Rejected pool: market cap too high', { address: pool.address, mcap });
            return false;
        }
        // Age filter (if available)
        if (pool.createdAt || pool.created_at) {
            const created = new Date(pool.createdAt || pool.created_at).getTime();
            const now = Date.now();
            if (now - created > this.TOKEN_MAX_AGE_MS) {
                logger.debug('Rejected pool: token too old', { address: pool.address });
                return false;
            }
        }
        this.seenPoolAddresses.add(pool.address);
        return true;
    }
    // Stop token discovery
    stop() {
        // Stop BirdeyeAPI WebSocket connection
        if (this.birdeyeAPI) {
            // this.birdeyeAPI.disconnectWebSocket(); // No such method; safe to remove or stub
        }
        // Stop cleanup interval
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        logger.info('TokenDiscovery stopped');
    }
    // Handle token events
    // TODO: Replace 'any' with a proper TokenEvent type if/when defined
    async handleTokenEvent(event) {
        // Early return for empty or invalid data
        if (!event.data || !event.data.address) {
            return;
        }
        // Add token to processing queue (with deduplication)
        this.tokenProcessQueue.set(event.data.address, event.data);
        // Process the queue if not already processing
        if (!this.processingQueue) {
            await this.processTokenQueue();
        }
    }
    // Process the token queue in batches to improve performance
    async processTokenQueue() {
        // Set flag to prevent concurrent processing
        this.processingQueue = true;
        try {
            while (this.tokenProcessQueue.size > 0) {
                // Get the next batch of tokens to process (up to 10 at a time)
                const batch = Array.from(this.tokenProcessQueue.entries()).slice(0, 10);
                // Remove processed tokens from the queue
                batch.forEach(([address]) => this.tokenProcessQueue.delete(address));
                // Process each token in the batch
                await Promise.all(batch.map(async ([_, tokenData]) => {
                    await this.processNewToken(tokenData);
                }));
                // Throttle processing to reduce CPU load
                if (this.tokenProcessQueue.size > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }
            }
        }
        catch (error) {
            logger.error('Error processing token queue', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
        finally {
            // Reset processing flag
            this.processingQueue = false;
        }
    }
    // Process a new token, enforcing all filters before emission
    async processNewToken(tokenData) {
        try {
            // Skip if already processed
            if (this.tokensDiscovered.has(tokenData.address)) {
                // Update existing token if needed (in-place update to save memory)
                const existingToken = this.tokensDiscovered.get(tokenData.address);
                // Only update specific fields to avoid unnecessary object creation
                if (tokenData.liquidity !== undefined)
                    existingToken.liquidity = tokenData.liquidity;
                if (tokenData.volume !== undefined)
                    existingToken.volume = tokenData.volume;
                if (tokenData.price !== undefined)
                    existingToken.price = tokenData.price;
                if (tokenData.priceChange !== undefined)
                    existingToken.priceChange = tokenData.priceChange;
                if (tokenData.mcap !== undefined)
                    existingToken.mcap = tokenData.mcap;
                if (tokenData.holders !== undefined)
                    existingToken.holders = tokenData.holders;
                // No re-emit for already discovered tokens
                return;
            }
            // Enforce blacklist, age, liquidity, and volume filters again (defensive)
            if (this.BLACKLIST.has(tokenData.address)) {
                logger.info('Rejected token: blacklisted', { address: tokenData.address });
                return;
            }
            if (tokenData.liquidity !== undefined && tokenData.liquidity < this.MIN_LIQUIDITY) {
                logger.debug('Rejected token: insufficient liquidity', { address: tokenData.address });
                return;
            }
            if (tokenData.volume !== undefined && tokenData.volume < this.MIN_VOLUME) {
                logger.debug('Rejected token: insufficient volume', { address: tokenData.address });
                return;
            }
            if (tokenData.createdAt || tokenData.createdAt) {
                const created = new Date(tokenData.createdAt || tokenData.createdAt).getTime();
                const now = Date.now();
                if (now - created > this.TOKEN_MAX_AGE_MS) {
                    logger.debug('Rejected token: too old', { address: tokenData.address });
                    return;
                }
            }
            // Apply initial filtering criteria
            if ((tokenData.liquidity !== undefined && tokenData.liquidity < this.MIN_LIQUIDITY) ||
                (tokenData.volume !== undefined && tokenData.volume < this.MIN_VOLUME)) {
                // Token doesn't meet criteria, skip processing
                return;
            }
            // Throttle analysis to prevent CPU spikes
            const now = Date.now();
            if (now - this.lastAnalysisTime < this.ANALYSIS_THROTTLE_MS) {
                await new Promise((resolve) => setTimeout(resolve, this.ANALYSIS_THROTTLE_MS));
            }
            this.lastAnalysisTime = Date.now();
            // Analyze the token (add a score and risk assessment)
            const analyzedToken = this.tokenAnalyzer.analyzeToken(tokenData);
            // Skip low-quality tokens
            if (analyzedToken.score < 30) {
                logger.debug('Low quality token skipped', {
                    address: tokenData.address,
                    symbol: tokenData.symbol,
                    score: analyzedToken.score,
                });
                return;
            }
            // Create a discovered token object with additional metadata
            const discoveredToken = {
                ...analyzedToken,
                analysisTime: Date.now(),
            };
            // Fix the types for the risk manager method
            if (this.riskManager) {
                try {
                    // Safely check if analyzeTokenRisk method exists before calling it
                    if (typeof this.riskManager['analyzeTokenRisk'] === 'function') {
                        const riskResult = await this.riskManager.analyzeTokenRisk(discoveredToken);
                        if (riskResult && riskResult.score > 80) {
                            logger.warn('High risk token detected', {
                                address: discoveredToken.address,
                                symbol: discoveredToken.symbol,
                                risk: riskResult.score,
                            });
                        }
                    }
                }
                catch (error) {
                    // Continue even if risk analysis fails
                    logger.error('Risk analysis error', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        address: discoveredToken.address,
                    });
                }
            }
            // Memory optimization: Set expiry time for automatic cleanup
            const expiryTime = Date.now() + this.TOKEN_MAX_AGE_MS;
            this.tokenExpiryTimes.set(tokenData.address, expiryTime);
            // Save the discovered token
            this.tokensDiscovered.set(discoveredToken.address, discoveredToken);
            /**
             * Emitted when a new, valid token is discovered and passes all filters.
             * @event TokenDiscovery#tokenDiscovered
             * @type {AnalyzedToken}
             */
            this.emit('tokenDiscovered', discoveredToken);
            logger.info('New token discovered', {
                address: discoveredToken.address,
                symbol: discoveredToken.symbol,
                name: discoveredToken.name,
                liquidity: discoveredToken.liquidity,
                score: discoveredToken.score,
            });
        }
        catch (error) {
            logger.error('Error processing new token', {
                error: error instanceof Error ? error.message : 'Unknown error',
                address: tokenData.address,
            });
        }
    }
    // Start the cleanup interval
    startCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTokens();
        }, this.CLEANUP_INTERVAL_MS);
        logger.info(`Token cleanup scheduled every ${this.CLEANUP_INTERVAL_MS / 1000} seconds`);
    }
    // Cleanup expired tokens
    cleanupExpiredTokens() {
        const now = Date.now();
        let expiredCount = 0;
        let remainingCount = 0;
        // Collect expired tokens
        const expiredAddresses = [];
        this.tokenExpiryTimes.forEach((expiryTime, address) => {
            if (now > expiryTime) {
                expiredAddresses.push(address);
                expiredCount++;
            }
            else {
                remainingCount++;
            }
        });
        // Remove expired tokens
        expiredAddresses.forEach((address) => {
            this.tokenExpiryTimes.delete(address);
            this.tokensDiscovered.delete(address);
        });
        if (expiredCount > 0) {
            logger.info(`Cleaned up ${expiredCount} expired tokens, ${remainingCount} remaining`);
            // Run garbage collection if available to reclaim memory
            this.runGarbageCollection();
        }
    }
    // Run garbage collection
    runGarbageCollection() {
        const memoryManager = new MemoryManager();
        memoryManager.triggerGarbageCollection(); // Correct method name
    }
    // Get the current token count
    getTokenCount() {
        return this.tokensDiscovered.size;
    }
    // Get a discovered token by address
    getToken(address) {
        return this.tokensDiscovered.get(address);
    }
    // Get all discovered tokens
    getAllTokens() {
        return Array.from(this.tokensDiscovered.values());
    }
    // Clean up resources
    destroy() {
        this.stop();
        this.tokensDiscovered.clear();
        this.tokenProcessQueue.clear();
        this.tokenExpiryTimes.clear();
        this.removeAllListeners();
    }
}
//# sourceMappingURL=tokenDiscovery.js.map