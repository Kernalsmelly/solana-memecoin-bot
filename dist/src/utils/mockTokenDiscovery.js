"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockTokenDiscovery = exports.MockTokenDiscovery = void 0;
// src/utils/mockTokenDiscovery.ts
const events_1 = require("events");
const uuid_1 = require("uuid");
const SYMBOLS = ['BONK', 'SAMO', 'WIF', 'DOGE', 'PEPE', 'SHIB', 'FLOKI', 'MOON', 'RUG', 'SCAM', 'HYPE', 'MEME'];
const NAMES = ['Bonk', 'Samoyed', 'DogWifHat', 'Dogecoin', 'Pepe', 'Shiba', 'Floki', 'Moon', 'Rugpull', 'Scammy', 'HypeCoin', 'MemeToken'];
function randomSymbol() {
    const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] ?? 'MOCK';
    return symbol + Math.floor(Math.random() * 1000);
}
function randomName() {
    const name = NAMES[Math.floor(Math.random() * NAMES.length)] ?? 'MockToken';
    return name + ' ' + Math.floor(Math.random() * 1000);
}
function randomLiquidity() {
    // $10k - $1M
    return Math.floor(Math.random() * 990_000 + 10_000);
}
function randomDecimals() {
    const options = [6, 8, 9];
    const idx = Math.floor(Math.random() * options.length);
    return options[idx] ?? 9; // fallback to 9 if somehow undefined
}
class MockTokenDiscovery extends events_1.EventEmitter {
    interval = null;
    running = false;
    tokens = [];
    start(intervalMs = 30000) {
        if (this.running)
            return;
        this.running = true;
        this.interval = setInterval(() => this.emitToken(), intervalMs);
        // Emit one immediately
        this.emitToken();
    }
    stop() {
        if (this.interval)
            clearInterval(this.interval);
        this.running = false;
    }
    emitToken() {
        const token = {
            address: (0, uuid_1.v4)().replace(/-/g, '').slice(0, 32),
            symbol: randomSymbol(),
            name: randomName(),
            decimals: randomDecimals(),
            liquidity: randomLiquidity(),
            createdAt: Date.now()
        };
        this.tokens.push(token);
        this.emit('tokenDiscovered', token);
    }
}
exports.MockTokenDiscovery = MockTokenDiscovery;
// Export singleton
exports.mockTokenDiscovery = new MockTokenDiscovery();
//# sourceMappingURL=mockTokenDiscovery.js.map