/**
 * Global test setup for vitest - optimized for minimal memory usage
 */
import { vi } from 'vitest';
import mockLogger from './mocks/mockLogger';

// Set memory-saving globals
globalThis.gc && globalThis.gc(); // Force garbage collection when available

// Mock the logger module with minimal implementation
vi.mock('../utils/logger', () => ({
  default: mockLogger
}));

// Simplified rate limiter mock
vi.mock('../utils/rateLimiter', () => ({
  default: {
    registerLimit: vi.fn(),
    getRateLimiter: vi.fn().mockReturnValue({
      schedule: (fn: () => any) => Promise.resolve(fn())
    })
  },
  globalRateLimiter: {
    registerLimit: vi.fn(),
    getRateLimiter: vi.fn().mockReturnValue({
      schedule: (fn: () => any) => Promise.resolve(fn())
    })
  }
}));

// Lighter weight mock for web3.js
vi.mock('@solana/web3.js', () => {
  const mockPublicKey = (address: string) => ({
    toString: () => address,
    toBase58: () => address
  });
  
  return {
    Connection: vi.fn().mockImplementation(() => ({
      getTokenAccountsByOwner: vi.fn().mockResolvedValue({ value: [] }),
      getParsedAccountInfo: vi.fn().mockResolvedValue({ value: null }),
      getRecentBlockhash: vi.fn().mockResolvedValue({ blockhash: 'mock' }),
      sendTransaction: vi.fn().mockResolvedValue('mock-tx')
    })),
    PublicKey: vi.fn().mockImplementation(mockPublicKey),
    Transaction: vi.fn().mockImplementation(() => ({
      add: vi.fn(),
      sign: vi.fn()
    })),
    SystemProgram: { transfer: vi.fn() }
  };
});

// Mock Birdeye API with minimal implementation
vi.mock('../api/birdeyeAPI', () => {
  const EventEmitter = require('events');
  const minimumMock = {
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
    connectWebSocket: vi.fn(),
    getTokenMetadata: vi.fn().mockResolvedValue(null)
  };
  
  return {
    BirdeyeAPI: vi.fn().mockImplementation(() => ({
      ...new EventEmitter(),
      ...minimumMock
    }))
  };
});

// Mock fetch API
global.fetch = vi.fn().mockImplementation((url) => {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      success: true,
      data: {
        price: 1.0,
        liquidity: 1000000,
        volume: 500000,
        tokenInfo: {
          name: 'Mock Token',
          symbol: 'MOCK',
          decimals: 9
        },
        transactions: {
          buys5min: 10,
          sells5min: 5,
          buys1h: 50,
          sells1h: 30
        }
      }
    })
  });
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
  // Force cleanup of memory usage - safely check if method exists
  if (typeof mockLogger.clear === 'function') {
    mockLogger.clear();
  }
});
