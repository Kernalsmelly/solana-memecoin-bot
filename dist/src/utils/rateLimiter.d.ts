interface RateLimitOptions {
    maxRequests: number;
    windowMs: number;
    errorThresholdPercent?: number;
}
/**
 * API Rate Limiter to prevent overloading external services
 * and implement exponential backoff on errors
 */
export declare class RateLimiter {
    private limiters;
    private options;
    private backoffMultipliers;
    /**
     * Register a new rate limit configuration for an API
     */
    registerLimit(apiName: string, options: RateLimitOptions): void;
    /**
     * Check if a request can be made to the specified API
     */
    canMakeRequest(apiName: string): Promise<boolean>;
    /**
     * Record a successful request to the API
     */
    recordSuccess(apiName: string): void;
    /**
     * Record a failed request to the API
     */
    recordError(apiName: string): void;
    /**
     * Reset rate limit counters for an API
     */
    reset(apiName: string): void;
}
export declare const globalRateLimiter: RateLimiter;
export default globalRateLimiter;
//# sourceMappingURL=rateLimiter.d.ts.map