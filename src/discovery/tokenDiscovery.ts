import { EventEmitter } from 'events';
import { BirdeyeAPI, TokenEvent } from '../api/birdeyeAPI';
import { BirdeyeTokenData, TokenAnalyzer, AnalyzedToken } from '../analysis/tokenAnalyzer';
import logger from '../utils/logger'; // Correct default import
import { MemoryManager } from '../utils/memoryManager'; // Correct class import

// Discovery options for configuration
export interface TokenDiscoveryOptions {
  minLiquidity?: number;   // Minimum liquidity in USD
  minVolume?: number;      // Minimum 24h volume in USD
  cleanupIntervalMs?: number; // Interval for token cleanup
  maxTokenAge?: number;    // Maximum token age in ms
  analysisThrottleMs?: number; // Throttle time for token analysis
}

// Risk manager interface (for flexibility)
export interface RiskManager {
  [key: string]: any;
}

// Token discovery class for processing token events
export class TokenDiscovery extends EventEmitter {
  private birdeyeAPI: BirdeyeAPI;
  private tokenAnalyzer: TokenAnalyzer;
  private riskManager?: RiskManager;
  private tokensDiscovered: Map<string, AnalyzedToken> = new Map();
  private tokenProcessQueue: Map<string, BirdeyeTokenData> = new Map();
  private tokenExpiryTimes: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private processingQueue: boolean = false;
  private lastAnalysisTime: number = 0;
  
  // Configuration
  private MIN_LIQUIDITY: number;
  private MIN_VOLUME: number;
  private CLEANUP_INTERVAL_MS: number;
  private TOKEN_MAX_AGE_MS: number;
  private ANALYSIS_THROTTLE_MS: number;
  
  constructor(
    birdeyeAPI: BirdeyeAPI,
    options: TokenDiscoveryOptions = {},
    riskManager?: RiskManager
  ) {
    super();
    this.birdeyeAPI = birdeyeAPI;
    this.riskManager = riskManager;
    
    // Initialize token analyzer
    this.tokenAnalyzer = new TokenAnalyzer({
      minLiquidity: options.minLiquidity || 1000,
      minHolders: 10 // Default
    });
    
    // Set configuration options with defaults
    this.MIN_LIQUIDITY = options.minLiquidity || 1000;
    this.MIN_VOLUME = options.minVolume || 500;
    this.CLEANUP_INTERVAL_MS = options.cleanupIntervalMs || 5 * 60 * 1000; // 5 minutes
    this.TOKEN_MAX_AGE_MS = options.maxTokenAge || 24 * 60 * 60 * 1000; // 24 hours
    this.ANALYSIS_THROTTLE_MS = options.analysisThrottleMs || 100; // 100ms throttle
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Start cleanup interval
    this.startCleanupInterval();
  }
  
  // Set up event listeners
  private setupEventListeners(): void {
    this.birdeyeAPI.on('tokenEvent', async (event: TokenEvent) => {
      await this.handleTokenEvent(event);
    });
    
    this.birdeyeAPI.on('error', (error: Error) => {
      logger.error('BirdeyeAPI error', {
        error: error.message
      });
    });
    
    this.birdeyeAPI.on('disconnected', () => {
      logger.warn('BirdeyeAPI disconnected');
    });
    
    this.birdeyeAPI.on('reconnectFailed', () => {
      logger.error('BirdeyeAPI reconnection failed');
      this.emit('error', new Error('BirdeyeAPI reconnection failed'));
    });
  }
  
  // Start token discovery
  public async start(): Promise<boolean> {
    try {
      const connected = await this.birdeyeAPI.connectWebSocket(['newTokens', 'volumeSpikes']);
      if (connected) {
        logger.info('TokenDiscovery started');
        return true;
      } else {
        logger.error('Failed to start TokenDiscovery: WebSocket connection failed');
        return false;
      }
    } catch (error) {
      logger.error('Error starting TokenDiscovery', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
  
  // Stop token discovery
  public stop(): void {
    this.birdeyeAPI.disconnect();
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.info('TokenDiscovery stopped');
  }
  
  // Handle token events
  private async handleTokenEvent(event: TokenEvent): Promise<void> {
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
  
  // Process a new token
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
        
        // Reset expiry time
        const expiryTime = Date.now() + this.TOKEN_MAX_AGE_MS;
        this.tokenExpiryTimes.set(tokenData.address, expiryTime);
        
        return;
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
      
      // Emit the token discovered event
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
