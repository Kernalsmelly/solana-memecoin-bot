"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewCoinDetector = void 0;
const events_1 = require("events");
const birdeyeAPI_1 = require("../api/birdeyeAPI");
const logger_1 = __importDefault(require("../utils/logger"));
class NewCoinDetector extends events_1.EventEmitter {
    constructor(config) {
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
        this.birdeyeAPI = new birdeyeAPI_1.BirdeyeAPI(config.birdeyeApiKey);
        this.isRunning = false;
    }
    async start() {
        if (this.isRunning) {
            logger_1.default.warn('NewCoinDetector is already running');
            return;
        }
        logger_1.default.info('Starting NewCoinDetector with config:', this.config);
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
        }
        catch (error) {
            logger_1.default.error('Failed to start NewCoinDetector:', error);
            this.isRunning = false;
            throw error;
        }
    }
    async stop() {
        if (!this.isRunning) {
            logger_1.default.warn('NewCoinDetector is not running');
            return;
        }
        logger_1.default.info('Stopping NewCoinDetector');
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        // Clean up Birdeye connection
        this.birdeyeAPI.removeAllListeners();
        await this.birdeyeAPI.disconnect();
        this.isRunning = false;
    }
    async handleNewToken(tokenAddress, tokenData) {
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
            logger_1.default.info('New token detected and validated', { address: tokenAddress, symbol: tokenData.symbol }); // Use token directly
            this.emit('newToken', tokenData); // Use token directly
            // Check for patterns
            await this.analyzePatterns(tokenData); // Use token directly
        }
        catch (error) {
            logger_1.default.error('Error handling new token:', error);
        }
    }
    validateToken(token) {
        const ageInHours = (Date.now() - token.timestamp) / (1000 * 60 * 60);
        return (token.liquidity >= this.config.minLiquidity &&
            ageInHours <= this.config.maxAgeHours);
    }
    async analyzePatterns(token) {
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
        }
        catch (error) {
            logger_1.default.error('Error analyzing patterns:', error);
        }
    }
    async detectPatterns(token, history) {
        const patterns = [];
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
    generateTradingSignal(pattern) {
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
    calculatePositionSize(liquidity) {
        return Math.min(50, liquidity * 0.01);
    }
    handleError(error) {
        logger_1.default.error('Birdeye API error:', error);
        this.emit('error', error);
    }
    async scan() {
        try {
            // Cleanup old tokens
            this.cleanupOldTokens();
            // Update metrics for existing tokens
            await this.updateExistingTokens();
            this.lastScanTime = Date.now();
        }
        catch (error) {
            logger_1.default.error('Error during scan:', error);
        }
    }
    cleanupOldTokens() {
        const now = Date.now();
        const maxAge = this.config.maxAgeHours * 60 * 60 * 1000;
        for (const [address, token] of this.detectionHistory) {
            if (now - token.timestamp > maxAge) {
                this.detectionHistory.delete(address);
                this.patternHistory.delete(address);
            }
        }
    }
    async updateExistingTokens() {
        const updatePromises = Array.from(this.detectionHistory.entries()).map(async ([address, token]) => {
            try {
                await this.analyzePatterns(token);
            }
            catch (error) {
                logger_1.default.error(`Error updating token ${address}:`, error);
            }
        });
        await Promise.all(updatePromises);
    }
    /**
     * Get the stored metrics for a specific token address.
     * @param address The token address
     * @returns TokenMetrics or undefined if not found
     */
    getTokenData(address) {
        return this.detectionHistory.get(address);
    }
}
exports.NewCoinDetector = NewCoinDetector;
