"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalRateLimiter = exports.RateLimiter = void 0;
const logger_1 = __importDefault(require("./logger"));
/**
 * API Rate Limiter to prevent overloading external services
 * and implement exponential backoff on errors
 */
class RateLimiter {
    constructor() {
        this.limiters = new Map();
        this.options = new Map();
        this.backoffMultipliers = new Map();
    }
    /**
     * Register a new rate limit configuration for an API
     */
    registerLimit(apiName, options) {
        this.options.set(apiName, {
            maxRequests: options.maxRequests,
            windowMs: options.windowMs,
            errorThresholdPercent: options.errorThresholdPercent || 10
        });
        this.limiters.set(apiName, {
            timestamp: Date.now(),
            count: 0,
            errors: 0
        });
        this.backoffMultipliers.set(apiName, 1);
        logger_1.default.debug(`Rate limit registered for ${apiName}`, options);
    }
    /**
     * Check if a request can be made to the specified API
     */
    async canMakeRequest(apiName) {
        if (!this.limiters.has(apiName)) {
            logger_1.default.warn(`No rate limit defined for ${apiName}`);
            return true;
        }
        const limiter = this.limiters.get(apiName);
        const options = this.options.get(apiName);
        const backoffMultiplier = this.backoffMultipliers.get(apiName);
        const now = Date.now();
        const elapsedMs = now - limiter.timestamp;
        // Reset counter if window has passed
        if (elapsedMs > options.windowMs) {
            limiter.timestamp = now;
            limiter.count = 0;
            this.limiters.set(apiName, limiter);
            return true;
        }
        // Check if we've reached the limit
        if (limiter.count >= options.maxRequests) {
            // Calculate time to wait
            const waitTimeMs = options.windowMs - elapsedMs;
            // Apply backoff multiplier if error rate is high
            const errorRate = (limiter.errors / limiter.count) * 100;
            const effectiveWaitTime = waitTimeMs *
                (errorRate > options.errorThresholdPercent ? backoffMultiplier : 1);
            logger_1.default.debug(`Rate limit hit for ${apiName}`, {
                waitTime: effectiveWaitTime,
                errorRate,
                backoffMultiplier
            });
            // Wait for the appropriate time
            if (effectiveWaitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, effectiveWaitTime));
                // Reset after waiting
                limiter.timestamp = Date.now();
                limiter.count = 0;
                this.limiters.set(apiName, limiter);
            }
        }
        // Increment request counter
        limiter.count++;
        this.limiters.set(apiName, limiter);
        return true;
    }
    /**
     * Record a successful request to the API
     */
    recordSuccess(apiName) {
        if (!this.limiters.has(apiName))
            return;
        // Reset backoff on success
        const currentBackoff = this.backoffMultipliers.get(apiName);
        if (currentBackoff > 1) {
            this.backoffMultipliers.set(apiName, Math.max(1, currentBackoff * 0.5));
        }
    }
    /**
     * Record a failed request to the API
     */
    recordError(apiName) {
        if (!this.limiters.has(apiName))
            return;
        const limiter = this.limiters.get(apiName);
        limiter.errors++;
        this.limiters.set(apiName, limiter);
        // Increase backoff multiplier on error (exponential backoff)
        const currentBackoff = this.backoffMultipliers.get(apiName);
        this.backoffMultipliers.set(apiName, Math.min(16, currentBackoff * 2));
        logger_1.default.debug(`API error recorded for ${apiName}`, {
            errors: limiter.errors,
            backoffMultiplier: this.backoffMultipliers.get(apiName)
        });
    }
    /**
     * Reset rate limit counters for an API
     */
    reset(apiName) {
        if (!this.limiters.has(apiName))
            return;
        this.limiters.set(apiName, {
            timestamp: Date.now(),
            count: 0,
            errors: 0
        });
        this.backoffMultipliers.set(apiName, 1);
        logger_1.default.debug(`Rate limit reset for ${apiName}`);
    }
}
exports.RateLimiter = RateLimiter;
// Create a singleton instance
exports.globalRateLimiter = new RateLimiter();
// Pre-configure common API limits
exports.globalRateLimiter.registerLimit('jupiter', {
    maxRequests: 10,
    windowMs: 1000, // 10 requests per second
    errorThresholdPercent: 20
});
exports.globalRateLimiter.registerLimit('birdeye', {
    maxRequests: 5,
    windowMs: 1000, // 5 requests per second
    errorThresholdPercent: 10
});
exports.globalRateLimiter.registerLimit('solana-rpc', {
    maxRequests: 40,
    windowMs: 1000, // 40 requests per second
    errorThresholdPercent: 15
});
exports.default = exports.globalRateLimiter;
