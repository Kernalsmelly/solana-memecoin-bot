import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewCoinDetector } from '../services/newCoinDetector';
import { TokenMetrics, PatternDetection, TradingSignal } from '../types';
import BirdeyeAPI from '../api/birdeyeAPI';

// Mock BirdeyeAPI
vi.mock('../api/birdeyeAPI');

describe('NewCoinDetector', () => {
    let detector: NewCoinDetector;
    let mockBirdeyeAPI: jest.Mocked<BirdeyeAPI>;

    const mockConfig = {
        minLiquidity: 5000,
        maxAgeHours: 72,
        scanIntervalSec: 10,
        birdeyeApiKey: 'mock-api-key'
    };

    const mockToken: TokenMetrics = {
        symbol: 'TEST',
        address: 'mock-token-address',
        price: 0.00001234,
        volume24h: 50000,
        liquidity: 25000,
        holders: 150,
        score: 85,
        age: 4,
        createdAt: Date.now() - 4 * 3600 * 1000,
        lastUpdated: Date.now()
    };

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();
        
        // Setup BirdeyeAPI mock
        mockBirdeyeAPI = {
            connectWebSocket: vi.fn().mockResolvedValue(undefined),
            disconnect: vi.fn().mockResolvedValue(undefined),
            getTokenMetrics: vi.fn().mockResolvedValue(mockToken),
            on: vi.fn(),
            removeAllListeners: vi.fn(),
        } as unknown as jest.Mocked<BirdeyeAPI>;

        // @ts-ignore - Mock constructor
        BirdeyeAPI.mockImplementation(() => mockBirdeyeAPI);

        // Create detector instance
        detector = new NewCoinDetector(mockConfig);
    });

    afterEach(async () => {
        await detector.stop();
    });

    describe('Service Lifecycle', () => {
        it('should start scanning when start() is called', async () => {
            await detector.start();

            expect(mockBirdeyeAPI.connectWebSocket).toHaveBeenCalledWith(['newTokens']);
            expect(mockBirdeyeAPI.on).toHaveBeenCalledWith('newToken', expect.any(Function));
            expect(mockBirdeyeAPI.on).toHaveBeenCalledWith('error', expect.any(Function));
        });

        it('should clean up resources when stop() is called', async () => {
            await detector.start();
            await detector.stop();

            expect(mockBirdeyeAPI.removeAllListeners).toHaveBeenCalled();
            expect(mockBirdeyeAPI.disconnect).toHaveBeenCalled();
        });
    });

    describe('Token Processing', () => {
        it('should process tokens from events', async () => {
            const tokenDetectedHandler = vi.fn();
            detector.on('tokenDetected', tokenDetectedHandler);

            await detector.start();

            // Simulate new token event
            const newTokenHandler = mockBirdeyeAPI.on.mock.calls.find(
                call => call[0] === 'newToken'
            )?.[1];

            if (newTokenHandler) {
                await newTokenHandler(mockToken.address, mockToken);
            }

            expect(tokenDetectedHandler).toHaveBeenCalledWith(
                mockToken.address,
                expect.objectContaining(mockToken)
            );
        });

        it('should filter tokens by criteria', async () => {
            const tokenDetectedHandler = vi.fn();
            detector.on('tokenDetected', tokenDetectedHandler);

            await detector.start();

            // Simulate new token event with invalid token
            const invalidToken = {
                ...mockToken,
                liquidity: 1000 // Below minimum
            };

            const newTokenHandler = mockBirdeyeAPI.on.mock.calls.find(
                call => call[0] === 'newToken'
            )?.[1];

            if (newTokenHandler) {
                await newTokenHandler(invalidToken.address, invalidToken);
            }

            expect(tokenDetectedHandler).not.toHaveBeenCalled();
        });

        it('should enrich token with additional metadata', async () => {
            const enrichedData = {
                ...mockToken,
                holders: 200,
                score: 90
            };

            mockBirdeyeAPI.getTokenMetrics.mockResolvedValueOnce(enrichedData);

            const tokenDetectedHandler = vi.fn();
            detector.on('tokenDetected', tokenDetectedHandler);

            await detector.start();

            // Simulate new token event
            const newTokenHandler = mockBirdeyeAPI.on.mock.calls.find(
                call => call[0] === 'newToken'
            )?.[1];

            if (newTokenHandler) {
                await newTokenHandler(mockToken.address, mockToken);
            }

            expect(mockBirdeyeAPI.getTokenMetrics).toHaveBeenCalledWith(mockToken.address);
            expect(tokenDetectedHandler).toHaveBeenCalledWith(
                mockToken.address,
                expect.objectContaining(enrichedData)
            );
        });
    });

    describe('Pattern Detection', () => {
        it('should detect patterns and emit signals', async () => {
            const patternDetectedHandler = vi.fn();
            const tradingSignalHandler = vi.fn();

            detector.on('patternDetected', patternDetectedHandler);
            detector.on('tradingSignal', tradingSignalHandler);

            await detector.start();

            // Simulate new token event with high volume
            const pumpToken = {
                ...mockToken,
                volume24h: 100000, // High volume relative to liquidity
            };

            const newTokenHandler = mockBirdeyeAPI.on.mock.calls.find(
                call => call[0] === 'newToken'
            )?.[1];

            if (newTokenHandler) {
                await newTokenHandler(pumpToken.address, pumpToken);
            }

            expect(patternDetectedHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    patternType: 'Mega Pump and Dump',
                    tokenAddress: pumpToken.address,
                    confidence: expect.any(Number)
                })
            );

            expect(tradingSignalHandler).toHaveBeenCalledWith(
                expect.objectContaining({
                    tokenAddress: pumpToken.address,
                    signalType: 'entry',
                    price: pumpToken.price
                })
            );
        });
    });
});
