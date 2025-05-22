import WebSocket from 'ws';
import { EventEmitter } from 'events';
import logger from '../utils/logger';
import axios from 'axios'; // Add axios for REST calls
import { globalCacheManager } from '../utils/cache';
import { memoryManager } from '../utils/memoryManager';
import { BirdeyeTokenData } from '../analysis/tokenAnalyzer';

// Define rate limiter interface for flexibility
interface RateLimiter {
  checkLimit(key: string): boolean;
  incrementCount(key: string): void;
}

// Simple rate limiter for testing
class SimpleRateLimiter implements RateLimiter {
  private limits: Map<string, { count: number; resetTime: number }> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 60, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  checkLimit(key: string): boolean {
    const now = Date.now();
    const limit = this.limits.get(key);

    if (!limit) return true;
    if (now > limit.resetTime) {
      this.limits.delete(key);
      return true;
    }

    return limit.count < this.maxRequests;
  }

  incrementCount(key: string): void {
    const now = Date.now();
    const limit = this.limits.get(key);

    if (!limit || now > limit.resetTime) {
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      });
    } else {
      limit.count += 1;
    }
  }
}

// Define the global rate limiter
export const globalRateLimiter = new SimpleRateLimiter();

// WebSocket message types
export interface TokenEvent {
  type: string;
  data: BirdeyeTokenData;
}

// BirdeyeAPI class for WebSocket connection and token data
export class BirdeyeAPI extends EventEmitter {
  private wsUrl: string;
  private apiKey: string;
  private wsClient: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimeoutMs: number = 2000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private metadataCache = globalCacheManager.getCache<BirdeyeTokenData>('tokenMetadata', {
    maxSize: 10000,
    ttl: 30 * 60 * 1000, // 30 minutes cache TTL
    onEvict: (key, value) => {
      logger.debug(`Token metadata evicted from cache: ${key}`);
    }
  });
  private rateLimiter: RateLimiter;
  private isReconnecting: boolean = false;
  private lastCleanupTime: number = Date.now();
  private cleanupIntervalMs: number = 10 * 60 * 1000; // 10 minutes
  private solPriceCache: { price: number; timestamp: number } | null = null;
  private readonly SOL_PRICE_CACHE_DURATION = 60 * 1000; // Cache SOL price for 60 seconds

  constructor(apiKey: string, wsUrl: string = 'wss://public-api.birdeye.so/socket', rateLimiter: RateLimiter = globalRateLimiter) {
    super();
    this.apiKey = apiKey;
    this.wsUrl = wsUrl;
    this.rateLimiter = rateLimiter;

    // Schedule cleanup to prevent memory leaks
    this.scheduleCleanup();
  }

  // Connect to WebSocket with automatic reconnection
  public async connectWebSocket(subscriptions: string[] = ['newTokens', 'volumeSpikes']): Promise<boolean> {
    if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      logger.info('WebSocket already connected');
      return true;
    }

    if (this.isReconnecting) {
      logger.info('Reconnection already in progress');
      return false;
    }

    // Clean up any existing connection
    this.cleanup();

    try {
      logger.info(`Connecting to Birdeye WebSocket at URL: ${this.wsUrl}`); // Log URL
      try {
        this.wsClient = new WebSocket(this.wsUrl, {
          // Explicitly set origin header
          headers: {
            'Origin': 'https://birdeye.so' 
          }
        });
        logger.info('WebSocket object created successfully.'); // Log success
      } catch (instantiationError) {
        logger.error('Error during WebSocket instantiation:', instantiationError);
        // Decide how to handle this - maybe re-throw or attempt reconnect?
        this.wsClient = null; // Ensure wsClient is null if instantiation failed
        this.attemptReconnect(subscriptions); 
        return false; // Indicate connection failed
      }

      // Set up WebSocket event listeners
      // Ensure wsClient is not null before attaching listeners
      if (this.wsClient) {
        this.wsClient.on('open', () => this.handleWsOpen(subscriptions));
        this.wsClient.on('message', (data) => this.handleWsMessage(data));
        this.wsClient.on('error', (error) => this.handleWsError(error));
        this.wsClient.on('close', (code, reason) => this.handleWsClose(code, reason, subscriptions));

        // Set up ping interval to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
            this.wsClient.ping();
          }
        }, 30000); // Send ping every 30 seconds
      } else {
        logger.error('Cannot set up WebSocket listeners: wsClient is null after instantiation attempt.');
        return false; // Indicate connection setup failed
      }

      return true; // Indicate connection process initiated
    } catch (error) {
      logger.error('Error in outer connectWebSocket try-catch block:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      this.attemptReconnect(subscriptions);
      return false;
    }
  }

  // Handle WebSocket open event
  private handleWsOpen(subscriptions: string[]): void {
    logger.info('Connected to Birdeye WebSocket');
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    logger.info('Attempting to send subscriptions...'); // Log before sending
    // Subscribe to each topic
    subscriptions.forEach(topic => {
      if (this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
        const subscribeMessage = {
          type: 'subscribe',
          topic,
          apiKey: this.apiKey // Keep API key here for stringify
        };
        // Log message but mask API key
        const messageToSend = JSON.stringify(subscribeMessage);
        const maskedMessage = messageToSend.replace(/"apiKey":"[^"]+"/, '"apiKey":"***MASKED***"');
        logger.info(`Sending subscription: ${maskedMessage}`); 
        try {
          this.wsClient.send(messageToSend);
          logger.info(`Successfully sent subscription for ${topic}`);
        } catch (sendError) {
          logger.error(`Error sending subscription for ${topic}:`, sendError);
          // Optionally attempt to handle this specific error, e.g., by retrying or closing
        }
      } else {
        logger.warn(`WebSocket not open when trying to subscribe to ${topic}. State: ${this.wsClient?.readyState}`);
      }
    });
    logger.info('Finished sending subscriptions.'); // Log after sending
    this.emit('connected');
  }

  // Handle WebSocket messages
  private handleWsMessage(data: WebSocket.Data): void {
    try {
      // Check if the data is a Buffer or string
      const messageStr = Buffer.isBuffer(data) ? data.toString() : String(data);
      const message = JSON.parse(messageStr);

      // Handle different message types
      if (message.type === 'newToken' || message.type === 'volumeSpike') {
        const tokenEvent: TokenEvent = {
          type: message.type,
          data: message.data
        };

        // Cache token metadata
        this.metadataCache.set(message.data.address, message.data);

        // Emit the token event
        this.emit('tokenEvent', tokenEvent);
      } 
      else if (message.type === 'subscribed') {
        logger.info(`Successfully subscribed to ${message.topic}`);
      }
      else if (message.type === 'error') {
        logger.error('WebSocket error message', { message: message.message });
      }
    } catch (error) {
      logger.error('Error parsing WebSocket message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        data: typeof data === 'string' ? data.substring(0, 100) : 'non-string data'
      });
    }
  }

  // Handle WebSocket error event
  private handleWsError(error: Error): void {
    logger.error('Birdeye WebSocket error encountered:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    this.emit('error', error);
    // Reconnect logic is handled in 'close' event
  }

  // Handle WebSocket close event
  private handleWsClose(code: number, reasonBuffer: Buffer, subscriptions: string[]): void {
    const reason = reasonBuffer.toString(); // Convert buffer to string
    logger.warn(`Birdeye WebSocket closed. Code: ${code}, Reason: ${reason}`);

    // Clean up intervals and attempt reconnect if not explicitly stopped
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    this.emit('disconnected', { code, reason });

    // Attempt to reconnect unless this was a deliberate closure
    if (code !== 1000 && code !== 1001) { 
      this.attemptReconnect(subscriptions);
    }
  }

  // Attempt to reconnect to WebSocket
  private attemptReconnect(subscriptions: string[]): void {
    if (this.isReconnecting) return;
    
    this.isReconnecting = true;
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Maximum reconnection attempts reached');
      this.emit('reconnectFailed');
      this.isReconnecting = false;
      return;
    }

    this.reconnectAttempts++;
    
    // Calculate exponential backoff with jitter
    const backoff = Math.min(
      30000, // Max 30 seconds
      this.reconnectTimeoutMs * Math.pow(1.5, this.reconnectAttempts - 1)
    );
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    const delay = backoff + jitter;

    logger.info(`Attempting to reconnect in ${Math.round(delay / 1000)} seconds (attempt ${this.reconnectAttempts})`);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      logger.info('Reconnecting to WebSocket...');
      this.connectWebSocket(subscriptions);
    }, delay);
  }

  // Disconnect WebSocket and clean up resources
  public disconnect(): void {
    logger.info('Disconnecting from Birdeye WebSocket');
    this.cleanup();
    this.emit('disconnected', { code: 1000, reason: 'Disconnect requested' });
  }

  // Clean up all resources
  private cleanup(): void {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close WebSocket if open
    if (this.wsClient) {
      if (this.wsClient.readyState === WebSocket.OPEN) {
        this.wsClient.terminate();
      }
      this.wsClient.removeAllListeners();
      this.wsClient = null;
    }

    this.isReconnecting = false;
  }

  // Get token metadata (from cache or API)
  public async getTokenMetadata(address: string): Promise<BirdeyeTokenData | null> {
    // Check cache first
    const cachedData = this.metadataCache.get(address);
    if (cachedData) {
      return cachedData;
    }

    // Rate limit check
    if (!this.rateLimiter.checkLimit(`tokenMetadata:${address}`)) {
      logger.warn('Rate limit exceeded for token metadata request', { address });
      return null;
    }

    // Increment rate limit counter
    this.rateLimiter.incrementCount(`tokenMetadata:${address}`);

    try {
      // Simulate API call for testing
      logger.info(`Fetching metadata for token ${address}`);
      
      // Return placeholder data for testing
      const metadata: BirdeyeTokenData = {
        address,
        symbol: `TOKEN-${address.substring(0, 4)}`,
        name: `Test Token ${address.substring(0, 4)}`,
        decimals: 9,
        liquidity: Math.random() * 10000,
        volume: Math.random() * 5000,
        price: Math.random() * 0.01,
        createdAt: Date.now() - Math.random() * 1000000
      };

      // Cache the result
      this.metadataCache.set(address, metadata);
      
      return metadata;
    } catch (error) {
      logger.error('Error fetching token metadata', {
        error: error instanceof Error ? error.message : 'Unknown error',
        address
      });
      return null;
    }
  }

  // Method to fetch token price via REST API (for latency check etc.)
  public async fetchTokenPrice(tokenAddress: string): Promise<number | null> {
    const url = `https://public-api.birdeye.so/public/price?address=${tokenAddress}`;
    logger.debug(`Fetching price from Birdeye REST API: ${url}`);
    try {
      const response = await axios.get(url, {
        headers: { 
          'X-API-KEY': this.apiKey, // Use the class API key
          'Accept': 'application/json'
        },
        timeout: 5000 // Set a timeout for the request
      });

      if (response.data && response.data.data && typeof response.data.data.value === 'number') {
        logger.debug(`Price received for ${tokenAddress}: ${response.data.data.value}`);
        return response.data.data.value;
      }
      logger.warn('Invalid price data format received from Birdeye', { address: tokenAddress, data: response.data });
      return null;
    } catch (error) {
      logger.error(`Error fetching token price from Birdeye for ${tokenAddress}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  // Fetches the current price of SOL in USD.
  // Uses caching to avoid excessive API calls.
  async getSolPrice(): Promise<number> {
    const now = Date.now();

    // Check cache first
    if (this.solPriceCache && (now - this.solPriceCache.timestamp < this.SOL_PRICE_CACHE_DURATION)) {
      logger.debug('Returning cached SOL price', { price: this.solPriceCache.price });
      return this.solPriceCache.price;
    }

    logger.info('Fetching fresh SOL price from Birdeye...');
    const endpoint = `https://public-api.birdeye.so/public/price?address=${'So11111111111111111111111111111111111111112'}`;
    try {
      const response = await axios.get(endpoint, {
        headers: {
          'X-API-KEY': this.apiKey
        }
      });

      if (response.data && response.data.data && typeof response.data.data.value === 'number') {
          const price = response.data.data.value;
          // Update cache
          this.solPriceCache = { price, timestamp: now };
          logger.info('Successfully fetched SOL price', { price });
          return price;
      } else {
        logger.warn('Birdeye SOL price response format unexpected', { responseData: response.data });
        throw new Error('Invalid data format in Birdeye SOL price response');
      }
    } catch (error) {
      logger.error('Failed to fetch SOL price from Birdeye', error);
      // If cache exists but is stale, return stale price as fallback?
      if (this.solPriceCache) {
        logger.warn('Returning stale SOL price due to fetch error', { price: this.solPriceCache.price });
        return this.solPriceCache.price;
      }
      throw error; // Re-throw if no cache available
    }
  }

  // Schedule periodic cleanup to prevent memory leaks
  private scheduleCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastCleanupTime >= this.cleanupIntervalMs) {
        this.performCleanup();
        this.lastCleanupTime = now;
      }
    }, 60000); // Check every minute
  }

  // Perform cleanup operations
  private performCleanup(): void {
    // Run cache cleanup
    const cleanedCount = this.metadataCache.cleanup();
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired token metadata entries`);
    }

    // Run garbage collection if available
    memoryManager.triggerGarbageCollection();
  }
}
