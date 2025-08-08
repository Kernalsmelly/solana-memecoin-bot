// src/utils/mockPriceFeed.ts
/**
 * Mock Price Feed Service
 * Simulates real-time price data for testing without connecting to actual blockchain
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

// Interface for price data
export interface TokenPrice {
  price: number;
  timestamp: Date;
}

export interface PricePoint {
  price: number;
  volume: number;
  timestamp: number;
}

export interface VolumeProfile {
  volumeTrend: number;
  volumeSpikes: number;
  averageVolume: number;
  recentVolume: number;
  previousPrice: number;
  currentPrice: number;
}

// Mock database of token prices
const mockPriceDatabase: Record<string, TokenPrice> = {
  SOL123: {
    price: 0.000023,
    timestamp: new Date(),
  },
  BONK: {
    price: 0.000032,
    timestamp: new Date(),
  },
  SAMO: {
    price: 0.0087,
    timestamp: new Date(),
  },
  WIF: {
    price: 0.0123,
    timestamp: new Date(),
  },
};

// Add some price volatility to make it more realistic
function applyPriceVolatility(price: number): number {
  // Create random movement of up to +/- 5%
  const volatilityFactor = 1 + (Math.random() * 0.1 - 0.05);
  return price * volatilityFactor;
}

/**
 * Mock price feed service class
 */
export class MockPriceFeed extends EventEmitter {
  private prices: Map<string, PricePoint[]> = new Map();
  private volumeProfiles: Map<string, VolumeProfile> = new Map();
  private readonly VOLUME_WINDOW = 10; // Number of price points to consider for volume analysis

  constructor() {
    super();
  }

  public getPrice(tokenAddress: string): number {
    const priceHistory = this.prices.get(tokenAddress);
    if (!priceHistory || priceHistory.length === 0) return 0;
    return priceHistory[priceHistory.length - 1]?.price ?? 0;
  }

  public updatePrice(
    tokenAddress: string,
    price: number,
    volume: number,
    volumeProfile?: Partial<VolumeProfile>,
  ): void {
    const pricePoint: PricePoint = {
      price,
      volume,
      timestamp: Date.now(),
    };

    // Initialize or update price history
    if (!this.prices.has(tokenAddress)) {
      this.prices.set(tokenAddress, []);
    }
    const priceHistory = this.prices.get(tokenAddress)!;
    priceHistory.push(pricePoint);

    // Keep only recent price points
    if (priceHistory.length > this.VOLUME_WINDOW) {
      priceHistory.shift();
    }

    // Calculate volume profile
    const previousPrice =
      priceHistory.length > 1 ? (priceHistory[priceHistory.length - 2]?.price ?? price) : price;
    const averageVolume = this.calculateAverageVolume(priceHistory);
    const volumeTrend = this.calculateVolumeTrend(priceHistory);
    const volumeSpikes = this.calculateVolumeSpikes(priceHistory, averageVolume);

    const newVolumeProfile: VolumeProfile = {
      volumeTrend,
      volumeSpikes,
      averageVolume,
      recentVolume: volume,
      previousPrice,
      currentPrice: price,
      ...volumeProfile,
    };

    this.volumeProfiles.set(tokenAddress, newVolumeProfile);
    this.emit('priceUpdate', { tokenAddress, price, volume, volumeProfile: newVolumeProfile });
  }

  public getVolumeProfile(tokenAddress: string): VolumeProfile {
    return (
      this.volumeProfiles.get(tokenAddress) || {
        volumeTrend: 0,
        volumeSpikes: 0,
        averageVolume: 0,
        recentVolume: 0,
        previousPrice: 0,
        currentPrice: 0,
      }
    );
  }

  private calculateAverageVolume(priceHistory: PricePoint[]): number {
    if (priceHistory.length === 0) return 0;
    const sum = priceHistory.reduce((acc, point) => acc + point.volume, 0);
    return sum / priceHistory.length;
  }

  private calculateVolumeTrend(priceHistory: PricePoint[]): number {
    if (priceHistory.length < 2) return 0;

    const recentVolumes = priceHistory.slice(-5);
    const oldVolumes = priceHistory.slice(0, -5);

    const recentAvg =
      recentVolumes.reduce((acc, point) => acc + point.volume, 0) / recentVolumes.length;
    const oldAvg =
      oldVolumes.length > 0
        ? oldVolumes.reduce((acc, point) => acc + point.volume, 0) / oldVolumes.length
        : recentAvg;

    return ((recentAvg - oldAvg) / oldAvg) * 100;
  }

  private calculateVolumeSpikes(priceHistory: PricePoint[], averageVolume: number): number {
    return priceHistory.reduce((spikes, point) => {
      return point.volume > averageVolume * 1.5 ? spikes + 1 : spikes;
    }, 0);
  }
}

// Export a singleton instance
export const mockPriceFeed = new MockPriceFeed();
