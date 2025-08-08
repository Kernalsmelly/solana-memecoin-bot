import { NewCoinDetector } from '../services/newCoinDetector.js';
import { config as importedConfig } from '../utils/config.js';
import { Connection } from '@solana/web3.js';
export class TestDetector {
    detector;
    namePrefixes = [
        'Super',
        'Mega',
        'Ultra',
        'Hyper',
        'Quantum',
        'Cyber',
        'Meta',
        'Degen',
        'Based',
        'Pepe',
    ];
    nameSuffixes = [
        'Token',
        'Coin',
        'Inu',
        'Moon',
        'Rocket',
        'Elon',
        'Finance',
        'Protocol',
        'AI',
        'Swap',
    ];
    constructor() {
        const config = importedConfig;
        const connection = new Connection(config.solana.rpcEndpoint);
        // Initialize detector (SWAP ARGUMENTS: connection first, then config)
        this.detector = new NewCoinDetector(connection, config);
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
            timestamp: Date.now(),
        };
        return token;
    }
}
//# sourceMappingURL=testDetection.js.map