import { TokenMetrics, PatternDetection } from './types';
import { EventEmitter } from 'events';
import logger from './utils/logger';

export class TokenMonitor extends EventEmitter {
    private tokens: Map<string, TokenMetrics>;
    private patterns: Map<string, PatternDetection>;

    constructor() {
        super();
        this.tokens = new Map();
        this.patterns = new Map();
    }

    public async addToken(metrics: TokenMetrics): Promise<void> {
        try {
            this.tokens.set(metrics.address, metrics);
            this.emit('newToken', metrics);
            logger.info(`Added new token ${metrics.symbol}`, {
                address: metrics.address,
                price: metrics.priceUsd,
                liquidity: metrics.liquidity
            });
        } catch (error) {
            logger.error('Error adding token:', error);
            this.emit('error', error);
        }
    }

    public async updateToken(metrics: TokenMetrics): Promise<void> {
        try {
            const existing = this.tokens.get(metrics.address);
            if (existing) {
                const currentPrice = metrics.priceUsd;
                const existingPrice = existing.priceUsd;
                const priceChange = typeof existingPrice === 'number' && existingPrice !== 0 && typeof currentPrice === 'number' 
                    ? Math.abs((currentPrice - existingPrice) / existingPrice)
                    : (typeof currentPrice === 'number' && currentPrice !== 0 ? Infinity : 0); // Handle undefined/zero

                const currentVolume = metrics.volume24h;
                const existingVolume = existing.volume24h;
                const volumeChange = typeof existingVolume === 'number' && existingVolume !== 0 && typeof currentVolume === 'number'
                    ? Math.abs((currentVolume - existingVolume) / existingVolume)
                    : (typeof currentVolume === 'number' && currentVolume !== 0 ? Infinity : 0); // Handle undefined/zero

                if (priceChange > 0.02 || volumeChange > 0.1) {
                    this.emit('tokenUpdate', metrics);
                }
            }

            this.tokens.set(metrics.address, metrics);
        } catch (error) {
            logger.error('Error updating token:', error);
            this.emit('error', error);
        }
    }

    public async addPattern(pattern: PatternDetection): Promise<void> {
        try {
            this.patterns.set(pattern.tokenAddress, pattern);
            this.emit('patternDetected', pattern);
            logger.info(`Pattern detected for ${pattern.tokenAddress}`, {
                pattern: pattern.pattern,
                confidence: pattern.confidence
            });
        } catch (error) {
            logger.error('Error adding pattern:', error);
            this.emit('error', error);
        }
    }

    public getToken(address: string): TokenMetrics | undefined {
        return this.tokens.get(address);
    }

    public getPattern(address: string): PatternDetection | undefined {
        return this.patterns.get(address);
    }

    public getAllTokens(): TokenMetrics[] {
        return Array.from(this.tokens.values());
    }

    public getAllPatterns(): PatternDetection[] {
        return Array.from(this.patterns.values());
    }

    public clearOldData(maxAge: number = 24 * 60 * 60 * 1000): void {
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
