import { EventEmitter } from 'events';
import { TokenMetrics, PatternDetection, TradingSignal } from '../types';

interface CoinDetectorConfig {
    minLiquidity: number;
    maxAgeHours: number;
    scanIntervalSec: number;
    birdeyeApiKey?: string;
}

export class NewCoinDetector extends EventEmitter {
    private config: Required<Omit<CoinDetectorConfig, 'birdeyeApiKey'>>;
    private detectionHistory: Map<string, TokenMetrics>;
    private patternHistory: Map<string, PatternDetection[]>;
    private lastScanTime: number;
    private intervalId?: NodeJS.Timeout;

    constructor(config: Partial<CoinDetectorConfig> = {}) {
        super();
        this.config = {
            minLiquidity: config.minLiquidity ?? 5000,
            maxAgeHours: config.maxAgeHours ?? 72,
            scanIntervalSec: config.scanIntervalSec ?? 10
        };
        this.detectionHistory = new Map();
        this.patternHistory = new Map();
        this.lastScanTime = 0;
    }

    public async startMonitoring(): Promise<void> {
        console.log('Starting token monitoring with config:', this.config);
        
        // For testing, generate some mock data
        this.intervalId = setInterval(() => this.generateMockData(), this.config.scanIntervalSec * 1000);
    }

    public async stopMonitoring(): Promise<void> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    private generateMockData(): void {
        const mockTokens: TokenMetrics[] = [
            {
                symbol: 'MOCK1',
                address: '0x1234...abcd',
                poolAddress: 'Pool1...', // Added placeholder
                priceUsd: 0.00001234,
                volume24h: 50000,
                liquidity: 25000,
                holders: 150,
                buys5min: 10,
                timestamp: Date.now() - 4 * 3600 * 1000
            },
            {
                symbol: 'MOCK2',
                address: '0x5678...efgh',
                poolAddress: 'Pool2...', // Added placeholder
                priceUsd: 0.00000789,
                volume24h: 75000,
                liquidity: 35000,
                holders: 250,
                buys5min: 25,
                timestamp: Date.now() - 2 * 3600 * 1000
            }
        ];

        for (const token of mockTokens) {
            // Emit new token event
            this.emit('newToken', token.address, token);

            // Generate random patterns
            if (Math.random() > 0.7) {
                const pattern: PatternDetection = {
                    pattern: 'Mock High Volume',
                    tokenAddress: token.address,
                    confidence: 85 + Math.random() * 10,
                    metrics: token,
                    timestamp: Date.now()
                };
                this.emit('patternDetected', pattern);

                // Generate trading signal
                const signal: TradingSignal = {
                    tokenAddress: token.address,
                    price: token.priceUsd * (1 + Math.random() * 0.05),
                    stopLoss: token.priceUsd * 0.9,
                    positionSize: Math.min(50, token.liquidity * 0.01),
                    confidence: pattern.confidence,
                    timestamp: Date.now(),
                    timeframe: '5m',
                    signalType: 'buy'
                };
                this.emit('tradingSignal', signal);
            }
        }
    }
}
