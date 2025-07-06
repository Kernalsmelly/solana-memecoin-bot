"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewCoinDetector = void 0;
const events_1 = require("events");
const bs58_1 = __importDefault(require("bs58"));
const crypto_1 = __importDefault(require("crypto"));
class NewCoinDetector extends events_1.EventEmitter {
    config;
    detectionHistory;
    patternHistory;
    lastScanTime;
    intervalId;
    constructor(config = {}) {
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
    async startMonitoring() {
        console.log('Starting token monitoring with config:', this.config);
        // For testing, generate some mock data
        this.intervalId = setInterval(() => this.generateMockData(), this.config.scanIntervalSec * 1000);
    }
    async stopMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }
    // Helper to generate a valid Solana base58 public key
    randomPubkey() {
        const bytes = crypto_1.default.randomBytes(32);
        return bs58_1.default.encode(bytes);
    }
    generateMockData() {
        const mockTokens = [
            {
                symbol: 'MOCK1',
                address: this.randomPubkey(),
                poolAddress: this.randomPubkey(),
                priceUsd: 0.00001234,
                volume24h: 50000,
                liquidity: 25000,
                holders: 150,
                buys5min: 10,
                timestamp: Date.now() - 4 * 3600 * 1000
            },
            {
                symbol: 'MOCK2',
                address: this.randomPubkey(),
                poolAddress: this.randomPubkey(),
                priceUsd: 0.00005678,
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
                const pattern = {
                    pattern: 'Mock High Volume',
                    tokenAddress: token.address,
                    confidence: 85 + Math.random() * 10,
                    metrics: token,
                    timestamp: Date.now()
                };
                this.emit('patternDetected', pattern);
                // Generate trading signal
                const signal = {
                    tokenAddress: token.address,
                    tokenSymbol: token.symbol,
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
exports.NewCoinDetector = NewCoinDetector;
//# sourceMappingURL=newCoinDetector.js.map