"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MomentumBreakoutStrategy = void 0;
const events_1 = require("events");
const rocMomentum_1 = require("./rocMomentum");
class MomentumBreakoutStrategy extends events_1.EventEmitter {
    name = 'momentumBreakout';
    enabled = true;
    cooldownSec = 300;
    priceHistory = {};
    maxHistory = 20;
    constructor(options = {}) {
        super();
        if (options.cooldownSec)
            this.cooldownSec = options.cooldownSec;
        if (options.maxHistory)
            this.maxHistory = options.maxHistory;
    }
    async handleOHLCV(event) {
        const token = event.tokenSymbol || event.address;
        if (!token || typeof event.close !== 'number')
            return;
        if (!this.priceHistory[token]) {
            this.priceHistory[token] = { prices: [], maxLen: this.maxHistory };
        }
        const history = this.priceHistory[token];
        history.prices.push(event.close);
        if (history.prices.length > history.maxLen)
            history.prices.shift();
        if (history.prices.length < 5)
            return; // Not enough data
        const analysis = await (0, rocMomentum_1.analyzeMomentum)(history.prices.map((price, i) => ({
            timestamp: event.timestamp - (history.prices.length - i - 1) * 60000,
            price,
            volume: typeof event.volume === 'number' ? event.volume : 0
        })), event.close);
        if (analysis.signal === 'BUY') {
            this.emit('patternMatch', {
                address: token,
                timestamp: event.timestamp,
                strategy: 'momentumBreakout',
                suggestedSOL: 1,
                details: analysis
            });
        }
    }
    // Implement the required execute method for Strategy interface
    async execute(token) {
        // In a real implementation, fetch OHLCV data and call handleOHLCV
        // For now, just log or call handleOHLCV with a stub event
        console.log(`[MomentumBreakoutStrategy] Executing strategy for token: ${token}`);
        // Optionally: await this.handleOHLCV({ tokenSymbol: token, timestamp: Date.now(), close: 0 });
    }
}
exports.MomentumBreakoutStrategy = MomentumBreakoutStrategy;
exports.default = MomentumBreakoutStrategy;
//# sourceMappingURL=momentumBreakout.js.map