"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VolatilitySqueeze = void 0;
const events_1 = require("events");
const tokenAnalyzer_1 = require("../analysis/tokenAnalyzer");
const logger_1 = __importDefault(require("../utils/logger"));
const rateLimiter_1 = require("../utils/rateLimiter");
class VolatilitySqueeze extends events_1.EventEmitter {
    tokenAnalyzer;
    rateLimiter;
    options;
    lastCheckTime;
    constructor(options = {}) {
        super();
        this.tokenAnalyzer = new tokenAnalyzer_1.TokenAnalyzer();
        this.rateLimiter = rateLimiter_1.globalRateLimiter;
        this.options = {
            priceChangeThreshold: options.priceChangeThreshold || 20, // 20% default
            volumeMultiplier: options.volumeMultiplier || 2, // 2x 1h SMA default
            lookbackPeriodMs: options.lookbackPeriodMs || 30 * 60 * 1000, // 30 min
            checkIntervalMs: options.checkIntervalMs || 60 * 1000 // 1 min
        };
        this.lastCheckTime = Date.now();
    }
    async start() {
        // Start checking for patterns
        setInterval(async () => {
            await this.checkForSqueeze();
        }, this.options.checkIntervalMs);
    }
    async checkForSqueeze() {
        // Rate limit check
        if (!await this.rateLimiter.canMakeRequest('birdeye')) {
            return;
        }
        try {
            // Get recent token data
            const recentTokens = await this.tokenAnalyzer.getRecentTokens();
            for (const token of recentTokens) {
                const isSqueeze = await this.detectSqueeze(token);
                if (isSqueeze) {
                    this.emit('patternMatch', {
                        token,
                        pattern: 'volatilitySqueeze',
                        suggestedPosition: 1 // Placeholder for position sizing
                    });
                }
            }
        }
        catch (error) {
            logger_1.default.error('Error in volatility squeeze detection:', error);
        }
    }
    async detectSqueeze(token) {
        // Get historical price data
        const history = await this.tokenAnalyzer.getPriceHistory(token.address, this.options.lookbackPeriodMs);
        if (!history || history.length < 2) {
            return false;
        }
        // Calculate price change
        const latestPrice = history[0].price;
        const oldestPrice = history[history.length - 1].price;
        const priceChange = ((latestPrice - oldestPrice) / oldestPrice) * 100;
        // Calculate volume metrics
        const currentVolume = history[0].volume;
        const oneHourVolume = history
            .slice(0, Math.floor(this.options.lookbackPeriodMs / (60 * 1000)))
            .reduce((sum, entry) => sum + entry.volume, 0) / history.length;
        // Check conditions
        const priceCondition = Math.abs(priceChange) >= this.options.priceChangeThreshold;
        const volumeCondition = currentVolume >= (oneHourVolume * this.options.volumeMultiplier);
        return priceCondition && volumeCondition;
    }
    stop() {
        // Cleanup any intervals
    }
}
exports.VolatilitySqueeze = VolatilitySqueeze;
//# sourceMappingURL=volatilitySqueeze.js.map