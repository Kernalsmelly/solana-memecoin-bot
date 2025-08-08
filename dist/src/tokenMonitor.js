import { EventEmitter } from 'events';
import logger from './utils/logger.js';
export class TokenMonitor extends EventEmitter {
    tokens;
    patterns;
    constructor() {
        super();
        this.tokens = new Map();
        this.patterns = new Map();
    }
    async addToken(metrics) {
        try {
            this.tokens.set(metrics.address, metrics);
            this.emit('newToken', metrics);
            logger.info(`Added new token ${metrics.symbol}`, {
                address: metrics.address,
                price: metrics.priceUsd,
                liquidity: metrics.liquidity,
            });
        }
        catch (error) {
            logger.error('Error adding token:', error);
            this.emit('error', error);
        }
    }
    async updateToken(metrics) {
        try {
            const existing = this.tokens.get(metrics.address);
            if (existing) {
                const currentPrice = metrics.priceUsd;
                const existingPrice = existing.priceUsd;
                const priceChange = typeof existingPrice === 'number' &&
                    existingPrice !== 0 &&
                    typeof currentPrice === 'number'
                    ? Math.abs((currentPrice - existingPrice) / existingPrice)
                    : typeof currentPrice === 'number' && currentPrice !== 0
                        ? Infinity
                        : 0; // Handle undefined/zero
                const currentVolume = metrics.volume24h;
                const existingVolume = existing.volume24h;
                const volumeChange = typeof existingVolume === 'number' &&
                    existingVolume !== 0 &&
                    typeof currentVolume === 'number'
                    ? Math.abs((currentVolume - existingVolume) / existingVolume)
                    : typeof currentVolume === 'number' && currentVolume !== 0
                        ? Infinity
                        : 0; // Handle undefined/zero
                if (priceChange > 0.02 || volumeChange > 0.1) {
                    this.emit('tokenUpdate', metrics);
                }
            }
            this.tokens.set(metrics.address, metrics);
        }
        catch (error) {
            logger.error('Error updating token:', error);
            this.emit('error', error);
        }
    }
    async addPattern(pattern) {
        try {
            this.patterns.set(pattern.tokenAddress, pattern);
            this.emit('patternDetected', pattern);
            logger.info(`Pattern detected for ${pattern.tokenAddress}`, {
                pattern: pattern.pattern,
                confidence: pattern.confidence,
            });
        }
        catch (error) {
            logger.error('Error adding pattern:', error);
            this.emit('error', error);
        }
    }
    getToken(address) {
        return this.tokens.get(address);
    }
    getPattern(address) {
        return this.patterns.get(address);
    }
    getAllTokens() {
        return Array.from(this.tokens.values());
    }
    getAllPatterns() {
        return Array.from(this.patterns.values());
    }
    clearOldData(maxAge = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        for (const [address, metrics] of this.tokens) {
            // Check if timestamp exists before comparison
            if (metrics.timestamp && now - metrics.timestamp > maxAge) {
                this.tokens.delete(address);
            }
        }
        for (const [address, pattern] of this.patterns) {
            // Check if timestamp exists before comparison
            if (pattern.timestamp && now - pattern.timestamp > maxAge) {
                this.patterns.delete(address);
            }
        }
    }
}
//# sourceMappingURL=tokenMonitor.js.map