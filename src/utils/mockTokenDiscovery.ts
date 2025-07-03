// src/utils/mockTokenDiscovery.ts
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface MockToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  liquidity: number;
  createdAt: number;
}

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

function randomDecimals(): number {
  const options = [6, 8, 9];
  const idx = Math.floor(Math.random() * options.length);
  return options[idx] ?? 9; // fallback to 9 if somehow undefined
}

export class MockTokenDiscovery extends EventEmitter {
  interval: NodeJS.Timeout | null = null;
  running: boolean = false;
  tokens: MockToken[] = [];

  start(intervalMs = 30000) {
    if (this.running) return;
    this.running = true;
    this.interval = setInterval(() => this.emitToken(), intervalMs);
    // Emit one immediately
    this.emitToken();
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.running = false;
  }

  emitToken() {
    const token: MockToken = {
      address: uuidv4().replace(/-/g, '').slice(0, 32),
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

// Export singleton
export const mockTokenDiscovery = new MockTokenDiscovery();
