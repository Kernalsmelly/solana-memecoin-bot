"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternDetector = void 0;
const events_1 = require("events");
class PatternDetector extends events_1.EventEmitter {
    windows = new Map();
    windowMs = 30 * 60 * 1000; // 30 minutes
    smaWindowMs = 60 * 60 * 1000; // 1 hour
    handleOHLCV(event) {
        const { address, close, volume, timestamp } = event;
        let win = this.windows.get(address);
        if (!win) {
            win = { prices: [], volumes: [], timestamps: [] };
            this.windows.set(address, win);
        }
        win.prices.push(close);
        win.volumes.push(volume);
        win.timestamps.push(timestamp);
        // Prune old data
        while (win.timestamps.length && timestamp - win.timestamps[0] > this.smaWindowMs) {
            win.prices.shift();
            win.volumes.shift();
            win.timestamps.shift();
        }
        // Check for squeeze
        this.checkSqueeze(address, win, timestamp);
    }
    checkSqueeze(address, win, now) {
        // Find indices for 30m and 1h windows
        let i30 = 0;
        while (i30 < win.timestamps.length && now - win.timestamps[i30] > this.windowMs)
            i30++;
        let i60 = 0;
        while (i60 < win.timestamps.length && now - win.timestamps[i60] > this.smaWindowMs)
            i60++;
        if (win.prices.length - i30 < 2)
            return; // not enough data
        const open = win.prices[i30];
        const close = win.prices[win.prices.length - 1];
        const vol30 = win.volumes.slice(i30).reduce((a, b) => a + b, 0);
        const vol60 = win.volumes.slice(i60).reduce((a, b) => a + b, 0);
        const n60 = win.volumes.length - i60;
        const sma1h = n60 > 0 ? vol60 / n60 : 0;
        if (open && close && sma1h) {
            if (close / open >= 1.2 && vol30 >= 2 * sma1h) {
                this.emit('patternMatch', {
                    address,
                    timestamp: now,
                    suggestedSOL: 1,
                    details: { open, close, vol30, sma1h }
                });
            }
        }
    }
}
exports.PatternDetector = PatternDetector;
//# sourceMappingURL=patternDetector.js.map