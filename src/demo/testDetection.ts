import { NewCoinDetector } from '../services/newCoinDetector.js';
import { TokenMetrics } from '../types.js';
import { Config, config as importedConfig } from '../utils/config.js';
import { Connection } from '@solana/web3.js';

export class TestDetector {
  private detector: NewCoinDetector;
  private namePrefixes = [
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
  private nameSuffixes = [
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
    const config: Config = importedConfig;

    const connection = new Connection(config.solana.rpcEndpoint);
    // Initialize detector (SWAP ARGUMENTS: connection first, then config)
    this.detector = new NewCoinDetector(connection, config);
  }

  public generateTestToken(): TokenMetrics {
    const prefix = this.namePrefixes[Math.floor(Math.random() * this.namePrefixes.length)];
    const suffix = this.nameSuffixes[Math.floor(Math.random() * this.nameSuffixes.length)];
    const symbol = `${prefix}${suffix}`.toUpperCase().slice(0, 8);

    const token: TokenMetrics = {
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
