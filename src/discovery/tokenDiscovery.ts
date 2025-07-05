import { EventEmitter } from 'events';
import { DataBroker } from '../integrations/data-hub/DataBroker';
import { RpcRotator } from '../integrations/data-hub/RpcRotator';
import { BirdeyeTokenData, TokenAnalyzer, AnalyzedToken } from '../analysis/tokenAnalyzer';
import logger from '../utils/logger';
import { MemoryManager } from '../utils/memoryManager';
import { BirdeyeAPI } from '../api/birdeyeAPI';
import { fetchHeliusTokenMetadata } from '../api/heliusAPI';
import { mockTokenDiscovery, MockToken } from '../utils/mockTokenDiscovery';
import { LRUCache } from '../utils/cache';
import { RateLimiter } from '../utils/rateLimiter';
import WebSocket from 'ws';

// Discovery options for configuration
export interface TokenDiscoveryOptions {
  minLiquidity?: number;   // Minimum liquidity in USD
  minVolume?: number;      // Minimum 24h volume in USD
  cleanupIntervalMs?: number; // Interval for token cleanup
  maxTokenAge?: number;    // Maximum token age in ms
  analysisThrottleMs?: number; // Throttle time for token analysis
  blacklist?: string[];    // List of blacklisted token addresses
}


// Risk manager interface (for flexibility)
export interface RiskManager {
  [key: string]: any;
}

// Token discovery class for processing token events
export class TokenDiscovery extends EventEmitter {
  private rpcRotator: RpcRotator;
  private tokenAnalyzer: TokenAnalyzer;
  private riskManager?: RiskManager;
  private tokensDiscovered: Map<string, AnalyzedToken> = new Map();
  
  private tokenProcessQueue: Map<string, BirdeyeTokenData> = new Map();
  private tokenExpiryTimes: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private processingQueue: boolean = false;
  private lastAnalysisTime: number = 0;

  // Birdeye API integration
  private birdeyeAPI?: BirdeyeAPI;
  private seenPoolAddresses: Set<string> = new Set();
  
  // Configuration
  private MIN_LIQUIDITY: number;
  private MIN_VOLUME: number;
  private CLEANUP_INTERVAL_MS: number;
  private TOKEN_MAX_AGE_MS: number;
  private ANALYSIS_THROTTLE_MS: number;
  private BLACKLIST: Set<string>;

  
  private useMockDiscovery: boolean = false;

  private tokenCache: LRUCache<BirdeyeTokenData> = new LRUCache({ maxSize: 1000, ttl: 60 * 60 * 1000 }); // 1 hour TTL
  private rateLimiter: RateLimiter = new RateLimiter();
  private ws: WebSocket | null = null;
  private wsBackoff: number = 1000;
  private wsConnected: boolean = false;

  constructor(
    options: TokenDiscoveryOptions = {},
    riskManager?: RiskManager
  ) {
    super();
    this.rpcRotator = new RpcRotator();
    this.riskManager = riskManager;

    // Hybrid logic: use mock discovery if no Birdeye/Helius API key
    // Use env var for min liquidity if present
    const envMinLiq = process.env.MIN_LIQUIDITY_USD ? Number(process.env.MIN_LIQUIDITY_USD) : undefined;
    const minLiquidity = envMinLiq || options.minLiquidity || 10000;
    this.MIN_LIQUIDITY = minLiquidity;

    // Use mock discovery ONLY if not mainnet/live mode
    this.useMockDiscovery = !process.env.BIRDEYE_API_KEY && !process.env.HELIUS_API_KEY && process.env.LIVE_MODE !== 'true' && process.env.NETWORK !== 'mainnet';
    if (this.useMockDiscovery) {
      logger.warn('[TokenDiscovery] No API key found, using mock token discovery.');
      mockTokenDiscovery.on('tokenDiscovered', (token: MockToken) => {
        // Forward as BirdeyeTokenData shape for compatibility
        const birdeyeToken: BirdeyeTokenData = {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          price: 0.00001 + Math.random() * 0.01,
          liquidity: token.liquidity,
          volume: Math.floor(Math.random() * 100000),
          createdAt: token.createdAt,
          // Add other fields as needed for downstream compatibility
        };
        this.emit('tokenDiscovered', birdeyeToken);
      });
      mockTokenDiscovery.start(30000); // Emit every 30s
    }
    // Initialize token analyzer
    this.tokenAnalyzer = new TokenAnalyzer({
      minLiquidity: minLiquidity,
      minHolders: 10 // Default
    });
    
    // Set configuration options with defaults
    this.MIN_LIQUIDITY = minLiquidity;
    this.MIN_VOLUME = options.minVolume || 500;
    this.CLEANUP_INTERVAL_MS = options.cleanupIntervalMs || 5 * 60 * 1000; // 5 minutes
    this.TOKEN_MAX_AGE_MS = options.maxTokenAge || 24 * 60 * 60 * 1000; // 24 hours
    this.ANALYSIS_THROTTLE_MS = options.analysisThrottleMs || 100; // 100ms throttle
    this.BLACKLIST = new Set(options.blacklist || []);
    // TODO: Allow dynamic update of blacklist from user config or external source
    // Start cleanup interval
    this.startCleanupInterval();

    // Fallback: If no real token discovered in X seconds, emit TEST_TARGET_TOKEN
    const fallbackSecs = process.env.TOKEN_DISCOVERY_FALLBACK_SECS ? Number(process.env.TOKEN_DISCOVERY_FALLBACK_SECS) : 60;
    const testTargetToken = process.env.TEST_TARGET_TOKEN;
    if (testTargetToken) {
      setTimeout(() => {
        if (this.tokensDiscovered.size === 0) {
          logger.warn(`[TokenDiscovery] No real tokens found after ${fallbackSecs}s, emitting TEST_TARGET_TOKEN`);
          this.emit('tokenDiscovered', {
            address: testTargetToken,
            symbol: 'TEST',
            name: 'Test Token',
            decimals: 9,
            liquidity: 999999,
            volume: 99999,
            price: 1,
            createdAt: Date.now(),
          });
        }
      }, fallbackSecs * 1000);
    }
  }
  
  
  
  // Start token discovery
  public async start(): Promise<boolean> {
    logger.info('TokenDiscovery started');
    const birdeyeWSUrl = 'wss://token-price.birdeye.so';
    const heliusApiKey = process.env.HELIUS_API_KEY;
    let reconnectAttempts = 0;

    const connectWS = () => {
      if (this.ws) {
        try { this.ws.close(); } catch {}
        this.ws = null;
      }
      logger.info(`[TokenDiscovery] Connecting to Birdeye WS...`);
      this.ws = new WebSocket(birdeyeWSUrl);
      this.wsConnected = false;

      this.ws.on('open', () => {
        logger.info('[TokenDiscovery] Birdeye WS connected');
        this.wsConnected = true;
        this.wsBackoff = 1000;
        reconnectAttempts = 0;
      });

      this.ws.on('message', async (data: any) => {
        try {
          const event = JSON.parse(data.toString());
          if (!event.address) return;
          // LRU cache check
          let cached = this.tokenCache.get(event.address);
          if (cached) {
            this.emit('tokenDiscovered', cached);
            return;
          }
          // Try to build BirdeyeTokenData from event
          let token: BirdeyeTokenData = {
            address: event.address,
            symbol: event.symbol || '',
            name: event.name || '',
            decimals: event.decimals || 9,
            liquidity: event.liquidityUsd || event.liquidity || 0,
            volume: event.volumeUsd24h || event.volume || 0,
            price: event.priceUsd || event.price || 0,
            createdAt: event.createdAt || Date.now(),
          };
          // If missing symbol/name/decimals, try Helius fallback
          if ((!token.symbol || !token.name || !token.decimals) && heliusApiKey) {
            if (await this.rateLimiter.canMakeRequest('helius')) {
              const heliusMeta = await fetchHeliusTokenMetadata(token.address, heliusApiKey);
              if (heliusMeta) {
                token = { ...token, ...heliusMeta };
              }
            }
          }
          this.tokenCache.set(token.address, token);
          this.emit('tokenDiscovered', token);
        } catch (err) {
          logger.debug('[TokenDiscovery] WS event parse error', err);
        }
      });

      this.ws.on('close', () => {
        logger.warn('[TokenDiscovery] Birdeye WS closed, will reconnect');
        this.wsConnected = false;
        reconnectAttempts++;
        setTimeout(connectWS, Math.min(60000, this.wsBackoff * Math.pow(2, reconnectAttempts)));
      });
      this.ws.on('error', (err: any) => {
        logger.debug('[TokenDiscovery] Birdeye WS error', err);
        if (!this.wsConnected) {
          this.ws?.close();
        }
      });
    };
    connectWS();
    return true;
  }

  // Filter pools by liquidity, volume, market cap, age, and blacklist
  private filterPool(pool: any): boolean {
    if (!pool) {
      logger.debug('Rejected pool: missing pool object');
      return false;
    }
    if (this.seenPoolAddresses.has(pool.address)) {
      logger.debug('Rejected pool: already seen', { address: pool.address });
      return false;
    }
    if (this.BLACKLIST.has(pool.address)) {
      logger.info('Rejected pool: blacklisted', { address: pool.address });
      return false;
    }
    const liquidity = pool.liquidityUsd ?? pool.liquidity ?? 0;
    if (liquidity < this.MIN_LIQUIDITY) {
      logger.debug('Rejected pool: insufficient liquidity', { address: pool.address, liquidity });
      return false;
    }
    const volume = pool.volumeUsd24h ?? pool.volume ?? 0;
    if (volume < this.MIN_VOLUME) {
      logger.debug('Rejected pool: insufficient volume', { address: pool.address, volume });
      return false;
    }
    const mcap = pool.mcapUsd ?? pool.mcap ?? 0;
    if (mcap > 50000) {
      logger.debug('Rejected pool: market cap too high', { address: pool.address, mcap });
      return false;
    }
    // Age filter (if available)
    if (pool.createdAt || pool.created_at) {
      const created = new Date(pool.createdAt || pool.created_at).getTime();
      const now = Date.now();
      if ((now - created) > this.TOKEN_MAX_AGE_MS) {
        logger.debug('Rejected pool: token too old', { address: pool.address });
        return false;
      }
    }
    this.seenPoolAddresses.add(pool.address);
    return true;
  }
  
  // Stop token discovery
  public stop(): void {
    // Stop BirdeyeAPI WebSocket connection
    if (this.birdeyeAPI) {
      // this.birdeyeAPI.disconnectWebSocket(); // No such method; safe to remove or stub
    }
    
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.info('TokenDiscovery stopped');
  }
  
  // Handle token events
  // TODO: Replace 'any' with a proper TokenEvent type if/when defined
  private async handleTokenEvent(event: any): Promise<void> {
    // Early return for empty or invalid data
    if (!event.data || !event.data.address) {
      return;
    }
    
    // Add token to processing queue (with deduplication)
    this.tokenProcessQueue.set(event.data.address, event.data);
    
    // Process the queue if not already processing
    if (!this.processingQueue) {
      await this.processTokenQueue();
    }
  }
  
  // Process the token queue in batches to improve performance
  private async processTokenQueue(): Promise<void> {
    // Set flag to prevent concurrent processing
    this.processingQueue = true;
    
    try {
      while (this.tokenProcessQueue.size > 0) {
        // Get the next batch of tokens to process (up to 10 at a time)
        const batch = Array.from(this.tokenProcessQueue.entries()).slice(0, 10);
        
        // Remove processed tokens from the queue
        batch.forEach(([address]) => this.tokenProcessQueue.delete(address));
        
        // Process each token in the batch
        await Promise.all(batch.map(async ([_, tokenData]) => {
          await this.processNewToken(tokenData);
        }));
        
        // Throttle processing to reduce CPU load
        if (this.tokenProcessQueue.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      logger.error('Error processing token queue', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      // Reset processing flag
      this.processingQueue = false;
    }
  }
  
  // Process a new token, enforcing all filters before emission
  private async processNewToken(tokenData: BirdeyeTokenData): Promise<void> {
    try {
      // Skip if already processed
      if (this.tokensDiscovered.has(tokenData.address)) {
        // Update existing token if needed (in-place update to save memory)
        const existingToken = this.tokensDiscovered.get(tokenData.address)!;
        
        // Only update specific fields to avoid unnecessary object creation
        if (tokenData.liquidity !== undefined) existingToken.liquidity = tokenData.liquidity;
        if (tokenData.volume !== undefined) existingToken.volume = tokenData.volume;
        if (tokenData.price !== undefined) existingToken.price = tokenData.price;
        if (tokenData.priceChange !== undefined) existingToken.priceChange = tokenData.priceChange;
        if (tokenData.mcap !== undefined) existingToken.mcap = tokenData.mcap;
        if (tokenData.holders !== undefined) existingToken.holders = tokenData.holders;
        
        // No re-emit for already discovered tokens
        return;
      }
      
      // Enforce blacklist, age, liquidity, and volume filters again (defensive)
      if (this.BLACKLIST.has(tokenData.address)) {
        logger.info('Rejected token: blacklisted', { address: tokenData.address });
        return;
      }
      if (tokenData.liquidity !== undefined && tokenData.liquidity < this.MIN_LIQUIDITY) {
        logger.debug('Rejected token: insufficient liquidity', { address: tokenData.address });
        return;
      }
      if (tokenData.volume !== undefined && tokenData.volume < this.MIN_VOLUME) {
        logger.debug('Rejected token: insufficient volume', { address: tokenData.address });
        return;
      }
      if (tokenData.createdAt || tokenData.createdAt) {
        const created = new Date(tokenData.createdAt || tokenData.createdAt).getTime();
        const now = Date.now();
        if ((now - created) > this.TOKEN_MAX_AGE_MS) {
          logger.debug('Rejected token: too old', { address: tokenData.address });
          return;
        }
      }
      
      // Apply initial filtering criteria
      if (
        tokenData.liquidity !== undefined && tokenData.liquidity < this.MIN_LIQUIDITY ||
        tokenData.volume !== undefined && tokenData.volume < this.MIN_VOLUME
      ) {
        // Token doesn't meet criteria, skip processing
        return;
      }
      
      // Throttle analysis to prevent CPU spikes
      const now = Date.now();
      if (now - this.lastAnalysisTime < this.ANALYSIS_THROTTLE_MS) {
        await new Promise(resolve => setTimeout(resolve, this.ANALYSIS_THROTTLE_MS));
      }
      this.lastAnalysisTime = Date.now();
      
      // Analyze the token (add a score and risk assessment)
      const analyzedToken = this.tokenAnalyzer.analyzeToken(tokenData);
      
      // Skip low-quality tokens
      if (analyzedToken.score < 30) {
        logger.debug('Low quality token skipped', {
          address: tokenData.address,
          symbol: tokenData.symbol,
          score: analyzedToken.score
        });
        return;
      }
      
      // Create a discovered token object with additional metadata
      const discoveredToken: AnalyzedToken = {
        ...analyzedToken,
        analysisTime: Date.now()
      };
      
      // Fix the types for the risk manager method
      if (this.riskManager) {
        try {
          // Safely check if analyzeTokenRisk method exists before calling it
          if (typeof this.riskManager['analyzeTokenRisk'] === 'function') {
            const riskResult = await (this.riskManager as any).analyzeTokenRisk(discoveredToken);
            if (riskResult && riskResult.score > 80) {
              logger.warn('High risk token detected', {
                address: discoveredToken.address,
                symbol: discoveredToken.symbol,
                risk: riskResult.score
              });
            }
          }
        } catch (error) {
          // Continue even if risk analysis fails
          logger.error('Risk analysis error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            address: discoveredToken.address
          });
        }
      }
      
      // Memory optimization: Set expiry time for automatic cleanup
      const expiryTime = Date.now() + this.TOKEN_MAX_AGE_MS;
      this.tokenExpiryTimes.set(tokenData.address, expiryTime);
      
      // Save the discovered token
      this.tokensDiscovered.set(discoveredToken.address, discoveredToken);
      
      /**
       * Emitted when a new, valid token is discovered and passes all filters.
       * @event TokenDiscovery#tokenDiscovered
       * @type {AnalyzedToken}
       */
      this.emit('tokenDiscovered', discoveredToken);
      
      logger.info('New token discovered', {
        address: discoveredToken.address,
        symbol: discoveredToken.symbol,
        name: discoveredToken.name,
        liquidity: discoveredToken.liquidity,
        score: discoveredToken.score
      });
    } catch (error) {
      logger.error('Error processing new token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        address: tokenData.address
      });
    }
  }
  
  // Start the cleanup interval
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
    }, this.CLEANUP_INTERVAL_MS);
    
    logger.info(`Token cleanup scheduled every ${this.CLEANUP_INTERVAL_MS / 1000} seconds`);
  }
  
  // Cleanup expired tokens
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let expiredCount = 0;
    let remainingCount = 0;
    
    // Collect expired tokens
    const expiredAddresses: string[] = [];
    this.tokenExpiryTimes.forEach((expiryTime, address) => {
      if (now > expiryTime) {
        expiredAddresses.push(address);
        expiredCount++;
      } else {
        remainingCount++;
      }
    });
    
    // Remove expired tokens
    expiredAddresses.forEach(address => {
      this.tokenExpiryTimes.delete(address);
      this.tokensDiscovered.delete(address);
    });
    
    if (expiredCount > 0) {
      logger.info(`Cleaned up ${expiredCount} expired tokens, ${remainingCount} remaining`);
      
      // Run garbage collection if available to reclaim memory
      this.runGarbageCollection();
    }
  }
  
  // Run garbage collection
  private runGarbageCollection(): void {
    const memoryManager = new MemoryManager();
    memoryManager.triggerGarbageCollection(); // Correct method name
  }
  
  // Get the current token count
  public getTokenCount(): number {
    return this.tokensDiscovered.size;
  }
  
  // Get a discovered token by address
  public getToken(address: string): AnalyzedToken | undefined {
    return this.tokensDiscovered.get(address);
  }
  
  // Get all discovered tokens
  public getAllTokens(): AnalyzedToken[] {
    return Array.from(this.tokensDiscovered.values());
  }
  
  // Clean up resources
  public destroy(): void {
    this.stop();
    this.tokensDiscovered.clear();
    this.tokenProcessQueue.clear();
    this.tokenExpiryTimes.clear();
    this.removeAllListeners();
  }
}

// Fix the global.gc type definition
declare global {
  // Use interface merging to add gc to the global object
  interface Global {
    gc?: () => void;
  }
}
