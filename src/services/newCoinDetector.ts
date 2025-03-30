import { EventEmitter } from 'events';
import { TokenMetrics, PatternDetection, TradingSignal } from '../types';
import { BirdeyeAPI } from '../api/birdeyeAPI';
import logger from '../utils/logger';

export interface CoinDetectorConfig {
    minLiquidity: number;
    maxAgeHours: number;
    scanIntervalSec: number;
    birdeyeApiKey: string;
    defaultStopLossPercent: number;
    defaultTimeframe: string;
}

export class NewCoinDetector extends EventEmitter {
    private config: Required<CoinDetectorConfig>;
    private detectionHistory: Map<string, TokenMetrics>;
    private patternHistory: Map<string, PatternDetection[]>;
    private lastScanTime: number;
    private intervalId?: NodeJS.Timeout;
    private birdeyeAPI: BirdeyeAPI;
    private isRunning: boolean;

    constructor(config: CoinDetectorConfig) {
        super();
        this.config = {
            minLiquidity: config.minLiquidity,
            maxAgeHours: config.maxAgeHours,
            scanIntervalSec: config.scanIntervalSec,
            birdeyeApiKey: config.birdeyeApiKey,
            defaultStopLossPercent: config.defaultStopLossPercent,
            defaultTimeframe: config.defaultTimeframe
        };
        this.detectionHistory = new Map();
        this.patternHistory = new Map();
        this.lastScanTime = 0;
        this.birdeyeAPI = new BirdeyeAPI(config.birdeyeApiKey);
        this.isRunning = false;
    }

    public async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('NewCoinDetector is already running');
            return;
        }

        logger.info('Starting NewCoinDetector with config:', this.config);
        this.isRunning = true;

        try {
            // Connect to Birdeye WebSocket
            await this.birdeyeAPI.connectWebSocket(['newTokens']);

            // Subscribe to Birdeye events
            this.birdeyeAPI.on('newToken', this.handleNewToken.bind(this));
            this.birdeyeAPI.on('error', this.handleError.bind(this));

            // Initial scan
            this.scan();

            // Schedule periodic scans
            this.intervalId = setInterval(() => this.scan(), this.config.scanIntervalSec * 1000);
        } catch (error) {
            logger.error('Failed to start NewCoinDetector:', error);
            this.isRunning = false;
            throw error;
        }
    }

    public async stop(): Promise<void> {
        if (!this.isRunning) {
            logger.warn('NewCoinDetector is not running');
            return;
        }

        logger.info('Stopping NewCoinDetector');

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        // Clean up Birdeye connection
        this.birdeyeAPI.removeAllListeners();
        await this.birdeyeAPI.disconnect();

        this.isRunning = false;
    }

    private async handleNewToken(tokenAddress: string, tokenData: TokenMetrics): Promise<void> {
        try {
            // Validate token based on initial data
            if (!this.validateToken(tokenData)) {
                return; // Skip if validation fails
            }

            // Check if already processed recently
            if (this.detectionHistory.has(tokenAddress)) {
                return;
            }
            this.detectionHistory.set(tokenAddress, tokenData);

            logger.info('New token detected and validated', { address: tokenAddress, symbol: tokenData.symbol }); // Use token directly
            this.emit('newToken', tokenData); // Use token directly

            // Check for patterns
            await this.analyzePatterns(tokenData); // Use token directly

        } catch (error) {
            logger.error('Error handling new token:', error);
        }
    }

    private validateToken(token: TokenMetrics): boolean {
        const ageInHours = (Date.now() - token.timestamp) / (1000 * 60 * 60);
        
        return (
            token.liquidity >= this.config.minLiquidity &&
            ageInHours <= this.config.maxAgeHours
        );
    }

    private async analyzePatterns(token: TokenMetrics): Promise<void> {
        try {
            // Get historical patterns for this token
            const tokenPatterns = this.patternHistory.get(token.address) || [];

            // Analyze for new patterns
            const newPatterns = await this.detectPatterns(token, tokenPatterns);

            if (newPatterns.length > 0) {
                // Update pattern history
                this.patternHistory.set(token.address, [...tokenPatterns, ...newPatterns]);

                // Emit pattern events
                for (const pattern of newPatterns) {
                    this.emit('patternDetected', pattern);

                    // Generate trading signal if confidence is high enough
                    if (pattern.confidence >= 85) {
                        const signal = this.generateTradingSignal(pattern);
                        this.emit('tradingSignal', signal);
                    }
                }
            }
        } catch (error) {
            logger.error('Error analyzing patterns:', error);
        }
    }

    private async detectPatterns(token: TokenMetrics, history: PatternDetection[]): Promise<PatternDetection[]> {
        const patterns: PatternDetection[] = [];

        // Example pattern detection logic
        if (token.volume24h / token.liquidity > 2) {
            patterns.push({
                pattern: 'High Volume/Liquidity Ratio',
                tokenAddress: token.address,
                confidence: 90,
                metrics: token,
                timestamp: Date.now()
            });
        }

        return patterns;
    }

    private generateTradingSignal(pattern: PatternDetection): TradingSignal {
        const token = pattern.metrics;

        return {
            tokenAddress: token.address,
            price: token.price,
            stopLoss: token.price * (1 - this.config.defaultStopLossPercent / 100),
            positionSize: this.calculatePositionSize(token.liquidity),
            confidence: pattern.confidence,
            timestamp: pattern.timestamp,
            timeframe: this.config.defaultTimeframe,
            signalType: 'buy'
        };
    }

    private calculatePositionSize(liquidity: number): number {
        return Math.min(50, liquidity * 0.01);
    }

    private handleError(error: Error): void {
        logger.error('Birdeye API error:', error);
        this.emit('error', error);
    }

    private async scan(): Promise<void> {
        try {
            // Cleanup old tokens
            this.cleanupOldTokens();

            // Update metrics for existing tokens
            await this.updateExistingTokens();

            this.lastScanTime = Date.now();
        } catch (error) {
            logger.error('Error during scan:', error);
        }
    }

    private cleanupOldTokens(): void {
        const now = Date.now();
        const maxAge = this.config.maxAgeHours * 60 * 60 * 1000;

        for (const [address, token] of this.detectionHistory) {
            if (now - token.timestamp > maxAge) {
                this.detectionHistory.delete(address);
                this.patternHistory.delete(address);
            }
        }
    }

    private async updateExistingTokens(): Promise<void> {
        const updatePromises = Array.from(this.detectionHistory.entries()).map(
            async ([address, token]) => {
                try {
                    await this.analyzePatterns(token);
                } catch (error) {
                    logger.error(`Error updating token ${address}:`, error);
                }
            }
        );

        await Promise.all(updatePromises);
    }

    /**
     * Get the stored metrics for a specific token address.
     * @param address The token address
     * @returns TokenMetrics or undefined if not found
     */
    public getTokenData(address: string): TokenMetrics | undefined {
        return this.detectionHistory.get(address);
    }
}