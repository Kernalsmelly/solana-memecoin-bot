"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VolatilitySqueeze = void 0;
const events_1 = require("events");
const logger_1 = __importDefault(require("../utils/logger"));
const axios_1 = __importDefault(require("axios"));
const mockPriceFeed_1 = require("../utils/mockPriceFeed");
class VolatilitySqueeze extends events_1.EventEmitter {
    name = 'volatilitySqueeze';
    async execute(token) {
        // In a real implementation, fetch and analyze OHLCV data for the token
        // For now, just log or call check()
        console.log(`[VolatilitySqueeze] Executing strategy for token: ${token}`);
        // Optionally: await this.check();
    }
    setParams(params) {
        if (params.priceChangeThreshold !== undefined)
            this.options.priceChangeThreshold = params.priceChangeThreshold;
        if (params.volumeMultiplier !== undefined)
            this.options.volumeMultiplier = params.volumeMultiplier;
    }
    options;
    lastCheckTime;
    interval;
    constructor(options = {}) {
        super();
        this.options = {
            priceChangeThreshold: options.priceChangeThreshold ?? 20,
            volumeMultiplier: options.volumeMultiplier ?? 2,
            lookbackPeriodMs: options.lookbackPeriodMs ?? 30 * 60 * 1000,
            checkIntervalMs: options.checkIntervalMs ?? 60 * 1000
        };
        this.lastCheckTime = Date.now();
        this.interval = null;
    }
    start() {
        if (!this.interval) {
            this.interval = setInterval(() => this.check(), this.options.checkIntervalMs);
        }
    }
    stop() {
        if (this.interval)
            clearInterval(this.interval);
        this.interval = null;
    }
    async check() {
        try {
            // Example: simulate a list of tokens (in real usage, get from discovery pipeline)
            const tokens = [
                { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana', decimals: 9 },
                { address: 'dummy', symbol: 'DUMMY', name: 'Dummy Token', decimals: 9 }
            ];
            for (const token of tokens) {
                let price = 0;
                let used = '';
                // Try Jupiter API for real price
                try {
                    const resp = await axios_1.default.get(`https://quote-api.jup.ag/v6/price?ids=${token.address}`);
                    if (resp.data && resp.data.data && resp.data.data[token.address]) {
                        price = resp.data.data[token.address].price;
                        used = 'jupiter';
                    }
                }
                catch (e) {
                    // Ignore and fall back
                }
                // Fallback to mock price feed
                if (!price) {
                    price = mockPriceFeed_1.mockPriceFeed.getPrice(token.address) || (0.00001 + Math.random() * 0.01);
                    used = 'mock';
                }
                // Simulate price/volume history for squeeze detection
                const priceHistory = Array.from({ length: 20 }, () => price * (0.95 + Math.random() * 0.1));
                const volumeHistory = Array.from({ length: 20 }, () => Math.floor(1000 + Math.random() * 5000));
                logger_1.default.info(`[VolatilitySqueeze] Using ${used} price source for ${token.symbol}: $${price.toFixed(6)}`);
                // Emit a pattern match event as example
                this.emit('patternMatch', {
                    token: { ...token, price },
                    priceHistory,
                    volumeHistory,
                    suggestedPosition: 0
                });
            }
        }
        catch (err) {
            logger_1.default.error('VolatilitySqueeze check error', err);
        }
    }
}
exports.VolatilitySqueeze = VolatilitySqueeze;
//# sourceMappingURL=volatilitySqueeze.js.map