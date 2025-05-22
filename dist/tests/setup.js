"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Global test setup for vitest - optimized for minimal memory usage
 */
const vitest_1 = require("vitest");
const mockLogger_1 = __importDefault(require("./mocks/mockLogger"));
// Set memory-saving globals
globalThis.gc && globalThis.gc(); // Force garbage collection when available
// Mock the logger module with minimal implementation
vitest_1.vi.mock('../utils/logger', () => ({
    default: mockLogger_1.default
}));
// Simplified rate limiter mock
vitest_1.vi.mock('../utils/rateLimiter', () => ({
    default: {
        registerLimit: vitest_1.vi.fn(),
        getRateLimiter: vitest_1.vi.fn().mockReturnValue({
            schedule: (fn) => Promise.resolve(fn())
        })
    },
    globalRateLimiter: {
        registerLimit: vitest_1.vi.fn(),
        getRateLimiter: vitest_1.vi.fn().mockReturnValue({
            schedule: (fn) => Promise.resolve(fn())
        })
    }
}));
// Lighter weight mock for web3.js
vitest_1.vi.mock('@solana/web3.js', () => {
    const mockPublicKey = (address) => ({
        toString: () => address,
        toBase58: () => address
    });
    return {
        Connection: vitest_1.vi.fn().mockImplementation(() => ({
            getTokenAccountsByOwner: vitest_1.vi.fn().mockResolvedValue({ value: [] }),
            getParsedAccountInfo: vitest_1.vi.fn().mockResolvedValue({ value: null }),
            getRecentBlockhash: vitest_1.vi.fn().mockResolvedValue({ blockhash: 'mock' }),
            sendTransaction: vitest_1.vi.fn().mockResolvedValue('mock-tx')
        })),
        PublicKey: vitest_1.vi.fn().mockImplementation(mockPublicKey),
        Transaction: vitest_1.vi.fn().mockImplementation(() => ({
            add: vitest_1.vi.fn(),
            sign: vitest_1.vi.fn()
        })),
        SystemProgram: { transfer: vitest_1.vi.fn() }
    };
});
// Mock Birdeye API with minimal implementation
vitest_1.vi.mock('../api/birdeyeAPI', () => {
    const EventEmitter = require('events');
    const minimumMock = {
        on: vitest_1.vi.fn(),
        off: vitest_1.vi.fn(),
        removeAllListeners: vitest_1.vi.fn(),
        disconnect: vitest_1.vi.fn(),
        connectWebSocket: vitest_1.vi.fn(),
        getTokenMetadata: vitest_1.vi.fn().mockResolvedValue(null)
    };
    return {
        BirdeyeAPI: vitest_1.vi.fn().mockImplementation(() => ({
            ...new EventEmitter(),
            ...minimumMock
        }))
    };
});
// Mock fetch API
global.fetch = vitest_1.vi.fn().mockImplementation((url) => {
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
// afterEach(() => {
//   vi.clearAllMocks();
//   // Force cleanup of memory usage - safely check if method exists
//   if (typeof mockLogger.clear === 'function') {
//     mockLogger.clear();
//   }
// });
//# sourceMappingURL=setup.js.map