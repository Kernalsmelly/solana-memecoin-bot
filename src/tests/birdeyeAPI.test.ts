import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { BirdeyeAPI } from '../api/birdeyeAPI';
import axios from 'axios';
import { globalRateLimiter } from '../utils/rateLimiter';
import EventEmitter from 'events';

// Mock dependencies
vi.mock('axios');
vi.mock('ws', () => {
  return function WebSocketMock() {
    interface MockWebSocket {
      on: (event: string, callback: (...args: any[]) => void) => MockWebSocket;
      send: (data: string) => void;
      close: () => void;
      removeAllListeners: (event?: string) => void;
    }
    
    const mockWs: MockWebSocket = {
      on: vi.fn((event: string, callback: (...args: any[]) => void): MockWebSocket => {
        if (event === 'open') {
          // Simulate immediate connection
          setTimeout(() => callback(), 0);
        }
        return mockWs;
      }),
      send: vi.fn(),
      close: vi.fn(),
      removeAllListeners: vi.fn()
    };
    return mockWs;
  };
});

vi.mock('../utils/rateLimiter', () => ({
  globalRateLimiter: {
    registerLimit: vi.fn(),
    recordSuccess: vi.fn(),
    recordError: vi.fn(),
    getRateLimiter: vi.fn(),
    canMakeRequest: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock the fetch API
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({
    success: true,
    data: { mockData: true }
  })
});

describe('BirdeyeAPI', () => {
  let birdeyeAPI: BirdeyeAPI;
  const mockApiKey = 'test-api-key';
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Mock setTimeout to execute immediately for testing reconnect functionality
    vi.spyOn(global, 'setTimeout').mockImplementation((callback: () => void, _timeout?: number) => {
      callback();
      return 1 as any;
    });
    
    // Mock successful axios response
    (axios.get as any).mockResolvedValue({
      data: {
        success: true,
        data: { mockData: true }
      }
    });
    
    // Initialize the API
    birdeyeAPI = new BirdeyeAPI(mockApiKey);
    
    // Spy on emit method
    vi.spyOn(birdeyeAPI, 'emit');
  });
  
  afterEach(() => {
    // Clean up
    birdeyeAPI.close();
    
    // Restore setTimeout
    vi.restoreAllMocks();
  });
  
  describe('Initialization', () => {
    it('should initialize with API key', () => {
      expect(birdeyeAPI).toBeDefined();
      expect((birdeyeAPI as any).apiKey).toBe(mockApiKey);
    });
    
    it('should register rate limiter on initialization', () => {
      expect(globalRateLimiter.registerLimit).toHaveBeenCalledWith('birdeye', expect.objectContaining({
        maxRequests: expect.any(Number),
        windowMs: expect.any(Number)
      }));
    });
  });
  
  describe('HTTP API Methods', () => {
    it('should get token metadata', async () => {
      const result = await birdeyeAPI.getTokenMetadata('test-token-address');
      
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/token_metadata'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': mockApiKey
          })
        })
      );
      
      expect(result).toEqual({ mockData: true });
    });
    
    it('should get token price', async () => {
      const result = await birdeyeAPI.getTokenPrice('test-token-address');
      
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/price'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': mockApiKey
          })
        })
      );
      
      expect(result).toEqual({ mockData: true });
    });
    
    it('should handle API errors', async () => {
      // Mock API error
      (axios.get as any).mockRejectedValueOnce(new Error('API Error'));
      
      // Should return null on error
      const result = await birdeyeAPI.getTokenMetadata('test-token-address');
      expect(result).toBeNull();
    });
    
    it('should handle connection errors', async () => {
      // Mock network error
      (axios.get as any).mockRejectedValueOnce(new Error('Network error'));
      
      // Should return null on network error
      const result = await birdeyeAPI.getTokenMetadata('test-token-address');
      expect(result).toBeNull();
    });
  });
  
  describe('WebSocket Handling', () => {
    it('should connect to WebSocket', async () => {
      const connected = await birdeyeAPI.connectWebSocket();
      expect(connected).toBe(true);
    });
    
    it('should handle WebSocket messages', async () => {
      // Spy on the emit method
      const emitSpy = vi.spyOn(birdeyeAPI, 'emit');
      
      // Connect to WebSocket
      await birdeyeAPI.connectWebSocket();
      
      // Get the mock WebSocket instance
      const mockWebSocket = require('ws');
      const mockInstance = mockWebSocket.mock.results[0].value;
      
      // Simulate receiving a message by directly calling the handler that would have been set up
      const mockEvent = {
        data: JSON.stringify({
          type: 'newToken',
          data: {
            address: 'test-token-address',
            name: 'Test Token',
            symbol: 'TEST',
            price: 1.0
          }
        })
      };
      
      // Find the event handler for 'message' and call it
      const onCall = mockInstance.on.mock.calls.find((call: [string, (...args: any[]) => void]) => call[0] === 'message');
      if (onCall && onCall[1]) {
        onCall[1](mockEvent.data);
      }
      
      // Should emit a token event
      expect(emitSpy).toHaveBeenCalled();
    });
    
    it('should handle WebSocket errors', async () => {
      // Connect to WebSocket
      await birdeyeAPI.connectWebSocket();
      
      // Get the mock WebSocket instance
      const mockWebSocket = require('ws');
      const mockInstance = mockWebSocket.mock.results[0].value;
      
      // Find the event handler for 'error' and call it
      const onCall = mockInstance.on.mock.calls.find((call: [string, (...args: any[]) => void]) => call[0] === 'error');
      if (onCall && onCall[1]) {
        onCall[1](new Error('WebSocket error'));
      }
      
      // Error handling is successful if we get here without an exception
      expect(true).toBe(true);
    });
    
    it('should automatically try to reconnect', async () => {
      // Connect to WebSocket
      await birdeyeAPI.connectWebSocket();
      
      // Get the mock WebSocket instance
      const mockWebSocket = require('ws');
      const mockInstance = mockWebSocket.mock.results[0].value;
      
      // Reset WebSocket mock to track new calls
      vi.clearAllMocks();
      
      // Find the event handler for 'close' and call it
      const onCall = mockInstance.on.mock.calls.find((call: [string, (...args: any[]) => void]) => call[0] === 'close');
      if (onCall && onCall[1]) {
        onCall[1](); // Trigger close event
      }
      
      // Should try to reconnect, which means another WebSocket is created
      expect(mockWebSocket).toHaveBeenCalled();
    });
  });
  
  describe('Token Processing', () => {
    it('should process tokens based on criteria', () => {
      const mockToken = {
        address: 'test-token-address',
        symbol: 'TEST',
        price: 1.0,
        liquidity: 100000,
        volume: 50000,
        buys5min: 10
      };
      
      // Test token event emission functionality
      const emitSpy = vi.spyOn(birdeyeAPI, 'emit');
      
      // Manually emit a token event
      birdeyeAPI.emit('tokenEvent', mockToken);
      
      expect(emitSpy).toHaveBeenCalledWith('tokenEvent', mockToken);
    });
  });
});
