"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenDiscovery = void 0;
const events_1 = require("events");
const RpcRotator_1 = require("../integrations/data-hub/RpcRotator");
const tokenAnalyzer_1 = require("../analysis/tokenAnalyzer");
const logger_1 = __importDefault(require("../utils/logger")); // Correct default import
const memoryManager_1 = require("../utils/memoryManager"); // Correct class import
// Token discovery class for processing token events
class TokenDiscovery extends events_1.EventEmitter {
    rpcRotator;
    tokenAnalyzer;
    riskManager;
    tokensDiscovered = new Map();
    tokenProcessQueue = new Map();
    tokenExpiryTimes = new Map();
    cleanupInterval = null;
    processingQueue = false;
    lastAnalysisTime = 0;
    // Configuration
    MIN_LIQUIDITY;
    MIN_VOLUME;
    CLEANUP_INTERVAL_MS;
    TOKEN_MAX_AGE_MS;
    ANALYSIS_THROTTLE_MS;
    constructor(options = {}, riskManager) {
        super();
        this.rpcRotator = new RpcRotator_1.RpcRotator();
        this.riskManager = riskManager;
        // Initialize token analyzer
        this.tokenAnalyzer = new tokenAnalyzer_1.TokenAnalyzer({
            minLiquidity: options.minLiquidity || 1000,
            minHolders: 10 // Default
        });
        // Set configuration options with defaults
        this.MIN_LIQUIDITY = options.minLiquidity || 1000;
        this.MIN_VOLUME = options.minVolume || 500;
        this.CLEANUP_INTERVAL_MS = options.cleanupIntervalMs || 5 * 60 * 1000; // 5 minutes
        this.TOKEN_MAX_AGE_MS = options.maxTokenAge || 24 * 60 * 60 * 1000; // 24 hours
        this.ANALYSIS_THROTTLE_MS = options.analysisThrottleMs || 100; // 100ms throttle
        // Set up event listeners
        // Start cleanup interval
        this.startCleanupInterval();
    }
    // Start token discovery
    async start() {
        logger_1.default.info('TokenDiscovery started');
        return true;
    }
    // Stop token discovery
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        logger_1.default.info('TokenDiscovery stopped');
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
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
        }
        catch (error) {
            logger_1.default.error('Error processing token queue', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        finally {
            // Reset processing flag
            this.processingQueue = false;
        }
    }
    // Process a new token
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
                // Reset expiry time
                const expiryTime = Date.now() + this.TOKEN_MAX_AGE_MS;
                this.tokenExpiryTimes.set(tokenData.address, expiryTime);
                return;
            }
            // Apply initial filtering criteria
            if (tokenData.liquidity !== undefined && tokenData.liquidity < this.MIN_LIQUIDITY ||
                tokenData.volume !== undefined && tokenData.volume < this.MIN_VOLUME) {
                // Token doesn't meet criteria, skip processing
                return;
            }
            // Throttle analysis to prevent CPU spikes
            const now = Date.now();
            if (now - this.lastAnalysisTime < this.ANALYSIS_THROTTLE_MS) {
                await new Promise(resolve => setTimeout(resolve, this.ANALYSIS_THROTTLE_MS));
            }
            this.lastAnalysisTime = Date.now();
            // Analyze the token (add a score and risk assessment)
            const analyzedToken = this.tokenAnalyzer.analyzeToken(tokenData);
            // Skip low-quality tokens
            if (analyzedToken.score < 30) {
                logger_1.default.debug('Low quality token skipped', {
                    address: tokenData.address,
                    symbol: tokenData.symbol,
                    score: analyzedToken.score
                });
                return;
            }
            // Create a discovered token object with additional metadata
            const discoveredToken = {
                ...analyzedToken,
                analysisTime: Date.now()
            };
            // Fix the types for the risk manager method
            if (this.riskManager) {
                try {
                    // Safely check if analyzeTokenRisk method exists before calling it
                    if (typeof this.riskManager['analyzeTokenRisk'] === 'function') {
                        const riskResult = await this.riskManager.analyzeTokenRisk(discoveredToken);
                        if (riskResult && riskResult.score > 80) {
                            logger_1.default.warn('High risk token detected', {
                                address: discoveredToken.address,
                                symbol: discoveredToken.symbol,
                                risk: riskResult.score
                            });
                        }
                    }
                }
                catch (error) {
                    // Continue even if risk analysis fails
                    logger_1.default.error('Risk analysis error', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        address: discoveredToken.address
                    });
                }
            }
            // Memory optimization: Set expiry time for automatic cleanup
            const expiryTime = Date.now() + this.TOKEN_MAX_AGE_MS;
            this.tokenExpiryTimes.set(tokenData.address, expiryTime);
            // Save the discovered token
            this.tokensDiscovered.set(discoveredToken.address, discoveredToken);
            // Emit the token discovered event
            this.emit('tokenDiscovered', discoveredToken);
            logger_1.default.info('New token discovered', {
                address: discoveredToken.address,
                symbol: discoveredToken.symbol,
                name: discoveredToken.name,
                liquidity: discoveredToken.liquidity,
                score: discoveredToken.score
            });
        }
        catch (error) {
            logger_1.default.error('Error processing new token', {
                error: error instanceof Error ? error.message : 'Unknown error',
                address: tokenData.address
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
        logger_1.default.info(`Token cleanup scheduled every ${this.CLEANUP_INTERVAL_MS / 1000} seconds`);
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
        expiredAddresses.forEach(address => {
            this.tokenExpiryTimes.delete(address);
            this.tokensDiscovered.delete(address);
        });
        if (expiredCount > 0) {
            logger_1.default.info(`Cleaned up ${expiredCount} expired tokens, ${remainingCount} remaining`);
            // Run garbage collection if available to reclaim memory
            this.runGarbageCollection();
        }
    }
    // Run garbage collection
    runGarbageCollection() {
        const memoryManager = new memoryManager_1.MemoryManager();
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
exports.TokenDiscovery = TokenDiscovery;
//# sourceMappingURL=tokenDiscovery.js.map