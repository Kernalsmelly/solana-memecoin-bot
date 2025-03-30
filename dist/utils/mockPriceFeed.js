"use strict";
// src/utils/mockPriceFeed.ts
/**
 * Mock Price Feed Service
 * Simulates real-time price data for testing without connecting to actual blockchain
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockPriceFeed = exports.MockPriceFeed = void 0;
const events_1 = require("events");
// Mock database of token prices
const mockPriceDatabase = {
    'SOL123': {
        price: 0.000023,
        timestamp: new Date()
    },
    'BONK': {
        price: 0.000032,
        timestamp: new Date()
    },
    'SAMO': {
        price: 0.0087,
        timestamp: new Date()
    },
    'WIF': {
        price: 0.0123,
        timestamp: new Date()
    }
};
// Add some price volatility to make it more realistic
function applyPriceVolatility(price) {
    // Create random movement of up to +/- 5%
    const volatilityFactor = 1 + (Math.random() * 0.1 - 0.05);
    return price * volatilityFactor;
}
/**
 * Mock price feed service class
 */
class MockPriceFeed extends events_1.EventEmitter {
    constructor() {
        super();
        this.prices = new Map();
        this.volumeProfiles = new Map();
        this.VOLUME_WINDOW = 10; // Number of price points to consider for volume analysis
    }
    getPrice(tokenAddress) {
        const priceHistory = this.prices.get(tokenAddress);
        if (!priceHistory || priceHistory.length === 0)
            return 0;
        return priceHistory[priceHistory.length - 1].price;
    }
    updatePrice(tokenAddress, price, volume, volumeProfile) {
        const pricePoint = {
            price,
            volume,
            timestamp: Date.now()
        };
        // Initialize or update price history
        if (!this.prices.has(tokenAddress)) {
            this.prices.set(tokenAddress, []);
        }
        const priceHistory = this.prices.get(tokenAddress);
        priceHistory.push(pricePoint);
        // Keep only recent price points
        if (priceHistory.length > this.VOLUME_WINDOW) {
            priceHistory.shift();
        }
        // Calculate volume profile
        const previousPrice = priceHistory.length > 1 ? priceHistory[priceHistory.length - 2].price : price;
        const averageVolume = this.calculateAverageVolume(priceHistory);
        const volumeTrend = this.calculateVolumeTrend(priceHistory);
        const volumeSpikes = this.calculateVolumeSpikes(priceHistory, averageVolume);
        const newVolumeProfile = {
            volumeTrend,
            volumeSpikes,
            averageVolume,
            recentVolume: volume,
            previousPrice,
            currentPrice: price,
            ...volumeProfile
        };
        this.volumeProfiles.set(tokenAddress, newVolumeProfile);
        this.emit('priceUpdate', { tokenAddress, price, volume, volumeProfile: newVolumeProfile });
    }
    getVolumeProfile(tokenAddress) {
        return (this.volumeProfiles.get(tokenAddress) || {
            volumeTrend: 0,
            volumeSpikes: 0,
            averageVolume: 0,
            recentVolume: 0,
            previousPrice: 0,
            currentPrice: 0
        });
    }
    calculateAverageVolume(priceHistory) {
        if (priceHistory.length === 0)
            return 0;
        const sum = priceHistory.reduce((acc, point) => acc + point.volume, 0);
        return sum / priceHistory.length;
    }
    calculateVolumeTrend(priceHistory) {
        if (priceHistory.length < 2)
            return 0;
        const recentVolumes = priceHistory.slice(-5);
        const oldVolumes = priceHistory.slice(0, -5);
        const recentAvg = recentVolumes.reduce((acc, point) => acc + point.volume, 0) / recentVolumes.length;
        const oldAvg = oldVolumes.length > 0
            ? oldVolumes.reduce((acc, point) => acc + point.volume, 0) / oldVolumes.length
            : recentAvg;
        return ((recentAvg - oldAvg) / oldAvg) * 100;
    }
    calculateVolumeSpikes(priceHistory, averageVolume) {
        return priceHistory.reduce((spikes, point) => {
            return point.volume > averageVolume * 1.5 ? spikes + 1 : spikes;
        }, 0);
    }
}
exports.MockPriceFeed = MockPriceFeed;
// Export a singleton instance
exports.mockPriceFeed = new MockPriceFeed();
