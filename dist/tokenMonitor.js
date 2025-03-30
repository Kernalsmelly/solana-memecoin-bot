"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenMonitor = void 0;
const events_1 = require("events");
const logger_1 = __importDefault(require("./utils/logger"));
class TokenMonitor extends events_1.EventEmitter {
    constructor() {
        super();
        this.tokens = new Map();
        this.patterns = new Map();
    }
    async addToken(metrics) {
        try {
            this.tokens.set(metrics.address, metrics);
            this.emit('newToken', metrics);
            logger_1.default.info(`Added new token ${metrics.symbol}`, {
                address: metrics.address,
                price: metrics.price,
                liquidity: metrics.liquidity
            });
        }
        catch (error) {
            logger_1.default.error('Error adding token:', error);
            this.emit('error', error);
        }
    }
    async updateToken(metrics) {
        try {
            const existing = this.tokens.get(metrics.address);
            if (existing) {
                // Check for significant changes
                const priceChange = Math.abs((metrics.price - existing.price) / existing.price);
                const volumeChange = Math.abs((metrics.volume24h - existing.volume24h) / existing.volume24h);
                if (priceChange > 0.02 || volumeChange > 0.1) {
                    this.emit('tokenUpdate', metrics);
                }
            }
            this.tokens.set(metrics.address, metrics);
        }
        catch (error) {
            logger_1.default.error('Error updating token:', error);
            this.emit('error', error);
        }
    }
    async addPattern(pattern) {
        try {
            this.patterns.set(pattern.tokenAddress, pattern);
            this.emit('patternDetected', pattern);
            logger_1.default.info(`Pattern detected for ${pattern.tokenAddress}`, {
                pattern: pattern.pattern,
                confidence: pattern.confidence
            });
        }
        catch (error) {
            logger_1.default.error('Error adding pattern:', error);
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
            if (now - metrics.timestamp > maxAge) {
                this.tokens.delete(address);
            }
        }
        for (const [address, pattern] of this.patterns) {
            if (now - pattern.timestamp > maxAge) {
                this.patterns.delete(address);
            }
        }
    }
}
exports.TokenMonitor = TokenMonitor;
