import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { BirdeyeTokenData, TokenEvent } from '../api/birdeyeAPI';

/**
 * Minimal test that only tests the bare essentials
 * This should help identify if there are resource issues in the full test suite
 */
describe('Minimal TokenDiscovery Test', () => {
  // Simple mocks to minimize memory usage
  const mockBirdeyeAPI = new EventEmitter();
  mockBirdeyeAPI.connectWebSocket = vi.fn();
  mockBirdeyeAPI.getTokenMetadata = vi.fn().mockResolvedValue({ name: 'Test', symbol: 'TEST' });
  mockBirdeyeAPI.disconnect = vi.fn();

  // A simplified version of the TokenDiscovery class with only essential functionality
  class MinimalTokenDiscovery extends EventEmitter {
    private isRunning = false;
    
    constructor() {
      super();
      // Setup minimal listeners
      mockBirdeyeAPI.on('tokenEvent', this.handleEvent.bind(this));
    }
    
    start() {
      this.isRunning = true;
      return Promise.resolve();
    }
    
    stop() {
      if (this.isRunning) {
        this.isRunning = false;
        mockBirdeyeAPI.removeAllListeners();
        this.removeAllListeners();
      }
    }
    
    handleEvent(event: TokenEvent) {
      // Very minimal processing to test event flow
      if (event.eventType === 'new') {
        this.emit('tokenDiscovered', {
          address: event.token.address,
          symbol: event.token.symbol
        });
      }
    }
  }
  
  let discovery: MinimalTokenDiscovery;
  
  beforeEach(() => {
    discovery = new MinimalTokenDiscovery();
  });
  
  afterEach(() => {
    discovery.stop();
    discovery = null;
    vi.clearAllMocks();
  });
  
  it('should process token events correctly', async () => {
    await discovery.start();
    
    const spy = vi.fn();
    discovery.on('tokenDiscovered', spy);
    
    const tokenEvent: TokenEvent = {
      eventType: 'new',
      token: {
        address: 'test-token',
        symbol: 'TEST',
        name: 'Test Token',
        decimals: 9,
        price: 1.0,
        priceChange24h: 5,
        volume24h: 1000000,
        liquidity: 200000,
        transactions: {
          buys5min: 10,
          sells5min: 5
        },
        creationTime: Date.now()
      } as BirdeyeTokenData,
      timestamp: Date.now()
    };
    
    mockBirdeyeAPI.emit('tokenEvent', tokenEvent);
    
    // Use a more controlled way to wait for async
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      address: 'test-token',
      symbol: 'TEST'
    }));
  });
});
