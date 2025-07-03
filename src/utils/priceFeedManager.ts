import axios from 'axios';
import { RateLimiter } from './rateLimiter';
import logger from './logger';

export interface OHLCVEvent {
  address: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface PriceFeedManagerOptions {
  rateLimiter: RateLimiter;
  dexScreenerApiUrl?: string;
  coingeckoApiUrl?: string;
}

export class PriceFeedManager {
  private rateLimiter: RateLimiter;
  private dexScreenerApiUrl: string;
  private coingeckoApiUrl: string;
  private lastRestFetch: Map<string, number> = new Map();
  private restIntervalMs: number = 30000;

  constructor(options: PriceFeedManagerOptions) {
    this.rateLimiter = options.rateLimiter;
    this.dexScreenerApiUrl = options.dexScreenerApiUrl || 'https://api.dexscreener.com/latest/dex/tokens/';
    this.coingeckoApiUrl = options.coingeckoApiUrl || 'https://api.coingecko.com/api/v3/coins/solana/contract/';
  }

  // Try to get price/volume from DexScreener
  async fetchDexScreener(address: string): Promise<Partial<OHLCVEvent> | null> {
    if (!(await this.rateLimiter.canMakeRequest('dexscreener'))) return null;
    try {
      const url = this.dexScreenerApiUrl + address;
      const res = await axios.get(url);
      const d = res.data?.pairs?.[0];
      if (!d) return null;
      return {
        address,
        close: Number(d.priceUsd),
        volume: Number(d.volume24h),
        // liquidity: Number(d.liquidity?.usd || 0),
        timestamp: Date.now()
      };
    } catch (e) {
      logger.debug('[DexScreener] REST fetch error', e);
      return null;
    }
  }

  // Try to get price from Coingecko
  async fetchCoingecko(address: string): Promise<Partial<OHLCVEvent> | null> {
    if (!(await this.rateLimiter.canMakeRequest('coingecko'))) return null;
    try {
      const url = this.coingeckoApiUrl + address;
      const res = await axios.get(url);
      const d = res.data?.market_data;
      if (!d) return null;
      return {
        address,
        close: Number(d.current_price?.usd || 0),
        volume: Number(d.total_volume?.usd || 0),
        timestamp: Date.now()
      };
    } catch (e) {
      logger.debug('[Coingecko] REST fetch error', e);
      return null;
    }
  }

  // Main fallback fetcher (rotates REST sources, rate-limited)
  async fetchFallback(address: string): Promise<OHLCVEvent | null> {
    const now = Date.now();
    if (this.lastRestFetch.get(address) && now - this.lastRestFetch.get(address)! < this.restIntervalMs) {
      return null;
    }
    this.lastRestFetch.set(address, now);
    // Try DexScreener first, then Coingecko
    let ohlcv = await this.fetchDexScreener(address);
    if (!ohlcv) {
      ohlcv = await this.fetchCoingecko(address);
    }
    if (!ohlcv) return null;
    // Fill missing fields with defaults
    return {
      address,
      open: ohlcv.close || 0,
      high: ohlcv.close || 0,
      low: ohlcv.close || 0,
      close: ohlcv.close || 0,
      volume: ohlcv.volume || 0,
      timestamp: ohlcv.timestamp || now
    };
  }
}
