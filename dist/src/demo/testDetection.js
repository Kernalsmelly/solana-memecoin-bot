"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestDetector = void 0;
const newCoinDetector_1 = require("../services/newCoinDetector");
const config_1 = require("../utils/config");
const web3_js_1 = require("@solana/web3.js");
class TestDetector {
    detector;
    namePrefixes = ['Super', 'Mega', 'Ultra', 'Hyper', 'Quantum', 'Cyber', 'Meta', 'Degen', 'Based', 'Pepe'];
    nameSuffixes = ['Token', 'Coin', 'Inu', 'Moon', 'Rocket', 'Elon', 'Finance', 'Protocol', 'AI', 'Swap'];
    constructor() {
        const config = config_1.config;
        const connection = new web3_js_1.Connection(config.solana.rpcEndpoint);
        // Initialize detector (SWAP ARGUMENTS: connection first, then config)
        this.detector = new newCoinDetector_1.NewCoinDetector(connection, config);
    }
    generateTestToken() {
        const prefix = this.namePrefixes[Math.floor(Math.random() * this.namePrefixes.length)];
        const suffix = this.nameSuffixes[Math.floor(Math.random() * this.nameSuffixes.length)];
        const symbol = `${prefix}${suffix}`.toUpperCase().slice(0, 8);
        const token = {
            address: `test_${symbol.toLowerCase()}_${Date.now()}`,
            symbol,
            priceUsd: 0.00001,
            liquidity: 5000,
            poolAddress: `pool_${symbol.toLowerCase()}_${Date.now()}`,
            volume24h: 2500,
            holders: 100,
            buys5min: 5,
            timestamp: Date.now()
        };
        return token;
    }
}
exports.TestDetector = TestDetector;
//# sourceMappingURL=testDetection.js.map