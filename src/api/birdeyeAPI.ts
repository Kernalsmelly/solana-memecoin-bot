import EventEmitter from 'events';

/**
 * BirdeyeAPI provides REST access to Birdeye premium endpoints for token metadata and price.
 * All usage is gated behind the USE_PREMIUM_DATA environment variable.
 * When premium data is disabled, mock data is returned for interface compatibility.
 */
export class BirdeyeAPI extends EventEmitter {
  /**
   * Connect to Birdeye WebSocket (stub for free tier).
   * For free tier, use REST polling fallback.
   */
  async connectWebSocket(_channels: string[] = []): Promise<boolean> {
    if (this.usePremium) {
      // Premium WS logic would go here.
      console.log('[BirdeyeAPI] Premium WebSocket not implemented.');
      return false;
    } else {
      // Start REST polling for new pools (free tier)
      this._startRestPolling();
      return true;
    }
  }

  public key: string;
  private usePremium: boolean;
  private _pingId?: NodeJS.Timeout;
  private _pollTimer?: NodeJS.Timeout;
  private _seenPools: Set<string> = new Set();

  constructor(apiKey: string) {
    super();
    this.key = apiKey;
    this.usePremium = process.env.USE_PREMIUM_DATA === 'true';
    if (this.usePremium) {
      // Register global rate limiter if present (pseudo-code)
      // globalRateLimiter.registerLimit('birdeye', { rps: 1 });
      // Maintain a ping interval to keep any session alive if needed
      this._pingId = setInterval(() => {}, 30000);
    }
  }

  /**
   * Start REST polling for new pools (free tier fallback).
   */
  private async _startRestPolling() {
    const axios = require('axios');
    const POLL_INTERVAL = 5000;
    const API_URL = 'https://public-api.birdeye.so/public/pool/all?sort_by=created_at&sort_type=desc&offset=0&limit=20';
    const headers = { 'X-API-KEY': this.key };
    const poll = async () => {
      try {
        const res = await axios.get(API_URL, { headers });
        const pools = res.data?.data || [];
        for (const pool of pools) {
          if (!this._seenPools.has(pool.address)) {
            this._seenPools.add(pool.address);
            this.emit('pool', pool);
          }
        }
      } catch (e) {
        if (e instanceof Error) {
          console.error('[BirdeyeAPI] REST poll error:', e.message);
        } else {
          console.error('[BirdeyeAPI] REST poll error:', e);
        }
      }
      this._pollTimer = setTimeout(poll, POLL_INTERVAL);
    };
    poll();
  }


  /**
   * Fetch token metadata from Birdeye. Returns mock data if premium is disabled.
   */
  async getTokenMetadata(address: string): Promise<{ address: string; name: string; symbol: string; liquidity?: number }> {
    if (!this.usePremium) {
      // Deterministic mock for tests or CI
      return { address, name: 'Dummy', symbol: 'DUM', liquidity: 100000 }; // Mock $100k liquidity for CI/tests
    }
    // Implement actual API call here
    throw new Error('Birdeye API call not implemented.');
  }

  /**
   * Fetch token price from Birdeye. Returns mock data if premium is disabled.
   */
  async getTokenPrice(address: string): Promise<{ address: string; priceUsd: number }> {
    if (!this.usePremium) {
      // Deterministic mock for tests or CI
      return { address, priceUsd: 0.01 };
    }
    // Implement actual API call here
    throw new Error('Birdeye API call not implemented.');
  }

  /**
   * Fetch the current SOL price in USD from Birdeye (or mock if premium is disabled).
   * Returns a number (price in USD).
   * When premium is off, returns a deterministic mock value for CI/test stability.
   */
  async getSolPrice(): Promise<number> {
    if (!this.usePremium) {
      // Deterministic mock for tests or CI
      return 100; // Example mock SOL price
    }
    // Implement actual API call here
    throw new Error('Birdeye SOL price API call not implemented.');
  }

  /**
   * Clean up any resources. No-op if premium data is disabled.
   */
  close() {
    if (!this.usePremium) return;
    if (this._pingId) clearInterval(this._pingId);
    this.emit('close');
  }

  /**
   * Disconnect from Birdeye WebSocket or clean up resources (no-op for now).
   */
  disconnect() {
    // If premium, clean up resources. For now, just emit event for interface compatibility.
    if (this.usePremium && this._pingId) {
      clearInterval(this._pingId);
      this._pingId = undefined;
    }
    this.emit('disconnected');
  }
}

/**
 * Optionally, export a default instance or factory if needed by the rest of the codebase.
 */
export default BirdeyeAPI;
