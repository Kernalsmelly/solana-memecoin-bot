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
                price: metrics.price,
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
                // Check for significant changes
                const priceChange = Math.abs((metrics.price - existing.price) / existing.price);
                const volumeChange = Math.abs((metrics.volume24h - existing.volume24h) / existing.volume24h);

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
