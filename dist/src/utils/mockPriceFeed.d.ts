/**
 * Mock Price Feed Service
 * Simulates real-time price data for testing without connecting to actual blockchain
 */
import { EventEmitter } from 'events';
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
/**
 * Mock price feed service class
 */
export declare class MockPriceFeed extends EventEmitter {
    private prices;
    private volumeProfiles;
    private readonly VOLUME_WINDOW;
    constructor();
    getPrice(tokenAddress: string): number;
    updatePrice(tokenAddress: string, price: number, volume: number, volumeProfile?: Partial<VolumeProfile>): void;
    getVolumeProfile(tokenAddress: string): VolumeProfile;
    private calculateAverageVolume;
    private calculateVolumeTrend;
    private calculateVolumeSpikes;
}
export declare const mockPriceFeed: MockPriceFeed;
//# sourceMappingURL=mockPriceFeed.d.ts.map