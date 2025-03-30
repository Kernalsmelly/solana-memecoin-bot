import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { BirdeyeAPI, TokenEvent, BirdeyeTokenData } from '../api/birdeyeAPI';
import { TokenDiscovery, TokenDiscoveryConfig, DiscoveredToken } from '../discovery/tokenDiscovery';
// Mock BirdeyeAPI
vi.mock('../api/birdeyeAPI', () => {
  const MockEventEmitter = require('events').EventEmitter;
  
  return {
    BirdeyeAPI: vi.fn().mockImplementation(() => {
      const instance = new MockEventEmitter();
      instance.connectWebSocket = vi.fn();
      instance.getTokenMetadata = vi.fn().mockResolvedValue({
        name: 'Mock Token',
        symbol: 'MOCK',
        decimals: 9,
        logoURI: 'https://example.com/logo.png'
      });
      instance.close = vi.fn();
      return instance;
    })
  };
});

describe('TokenDiscovery', () => {
  let tokenDiscovery: TokenDiscovery;
  let mockBirdeyeAPI: any;
  
  beforeEach(() => {
    // Create new instances for each test
    mockBirdeyeAPI = new BirdeyeAPI('test-api-key');
    tokenDiscovery = new TokenDiscovery({ birdeyeAPI: mockBirdeyeAPI });
    
    // Spy on emit method
    vi.spyOn(tokenDiscovery, 'emit');
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    tokenDiscovery.stop();
    tokenDiscovery.removeAllListeners(); // Ensure all listeners are removed
    // Force cleanup of any potential circular references
    (tokenDiscovery as any).config = null;
    (tokenDiscovery as any).tokensDiscovered = null;
  });
  
  describe('Initialization', () => {
    it('should initialize with BirdeyeAPI', () => {
      expect(tokenDiscovery).toBeDefined();
    });
    
    it('should set up event handlers for BirdeyeAPI', () => {
      const addListenerSpy = vi.spyOn(mockBirdeyeAPI, 'on');
      
      // Create new instance to trigger the event listener setup
      const newTokenDiscovery = new TokenDiscovery({ birdeyeAPI: mockBirdeyeAPI });
      
      expect(addListenerSpy).toHaveBeenCalledWith('tokenEvent', expect.any(Function));
    });
  });
  
  describe('Token Processing', () => {
    it('should process tokens from events', async () => {
      // Start token discovery
      await tokenDiscovery.start();

      // Spy on the private handleTokenEvent method for this instance
      const handleTokenEventSpy = vi.spyOn(tokenDiscovery as any, 'handleTokenEvent');
      
      // Create a valid token event
      const mockToken: BirdeyeTokenData = {
        address: 'mock-token-address',
        symbol: 'MOCK',
        name: 'Mock Token',
        decimals: 9,
        price: 1.0,
        priceChange24h: 5,
        volume24h: 1000000,
        liquidity: 200000,
        transactions: {
          buys5min: 15,
          sells5min: 5,
          buys1h: 100,
          sells1h: 50
        },
        creationTime: Date.now() - (2 * 60 * 60 * 1000) // 2 hours old
      };

      const mockTokenEvent: TokenEvent = {
        eventType: 'new',
        token: mockToken,
        timestamp: Date.now()
      };
      
      // Manually trigger the tokenEvent event on mockBirdeyeAPI
      mockBirdeyeAPI.emit('tokenEvent', mockTokenEvent);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should call handleTokenEvent method with the correct event structure
      expect(handleTokenEventSpy).toHaveBeenCalledWith(mockTokenEvent);
    });
    
    it('should filter tokens by criteria', async () => {
      // Start token discovery
      await tokenDiscovery.start();

      // Spy on the token discovered event
      const tokenDiscoveredSpy = vi.fn();
      tokenDiscovery.on('tokenDiscovered', tokenDiscoveredSpy);
      
      // Create a token event that's too old (>24 hours)
      const oldToken: BirdeyeTokenData = {
        address: 'old-token-address',
        symbol: 'OLD',
        name: 'Old Token',
        decimals: 9,
        price: 1.0,
        priceChange24h: 5,
        volume24h: 1000000,
        liquidity: 200000,
        transactions: {
          buys5min: 15,
          sells5min: 5,
          buys1h: 100,
          sells1h: 50
        },
        creationTime: Date.now() - (25 * 60 * 60 * 1000) // 25 hours old
      };

      const oldTokenEvent: TokenEvent = {
        eventType: 'new',
        token: oldToken,
        timestamp: Date.now()
      };
      
      // Manually trigger the tokenEvent event
      mockBirdeyeAPI.emit('tokenEvent', oldTokenEvent);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should not emit tokenDiscovered for old tokens
      expect(tokenDiscoveredSpy).not.toHaveBeenCalled();
    });
    
    it('should enrich token data', async () => {
      // Start token discovery
      await tokenDiscovery.start();

      // Spy on the token discovered event
      const tokenDiscoveredSpy = vi.fn();
      tokenDiscovery.on('tokenDiscovered', tokenDiscoveredSpy);
      
      // Mock token metadata
      const mockMetadata = {
        name: 'Enriched Token',
        symbol: 'RICH',
        decimals: 9,
        logoURI: 'https://example.com/logo.png'
      };
      
      mockBirdeyeAPI.getTokenMetadata.mockResolvedValueOnce(mockMetadata);
      
      // Create a valid token event
      const newToken: BirdeyeTokenData = {
        address: 'new-token-address',
        symbol: 'NEW',
        name: 'New Token',
        decimals: 9,
        price: 1.0,
        priceChange24h: 5,
        volume24h: 1000000,
        liquidity: 200000,
        transactions: {
          buys5min: 15,
          sells5min: 5,
          buys1h: 100,
          sells1h: 50
        },
        creationTime: Date.now() - (1 * 60 * 60 * 1000) // 1 hour old
      };

      const tokenEvent: TokenEvent = {
        eventType: 'new',
        token: newToken,
        timestamp: Date.now()
      };
      
      // Create a promise that resolves when the event is fired
      const discoveryPromise = new Promise<DiscoveredToken>(resolve => {
        tokenDiscovery.once('tokenDiscovered', (token) => resolve(token)); // Use 'once' to avoid issues if event fired multiple times
      });

      // Manually trigger the tokenEvent event
      mockBirdeyeAPI.emit('tokenEvent', tokenEvent);
      
      // Wait for the tokenDiscovered event to be emitted
      await discoveryPromise; // Wait for the specific event
      
      // Now run assertions
      expect(mockBirdeyeAPI.getTokenMetadata).toHaveBeenCalledWith(tokenEvent.token.address);
      expect(tokenDiscoveredSpy).toHaveBeenCalledTimes(1); // Verify it was called exactly once
      expect(tokenDiscoveredSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          address: tokenEvent.token.address,
          name: mockMetadata.name,
          symbol: mockMetadata.symbol
        })
      );
    });
  });
});
