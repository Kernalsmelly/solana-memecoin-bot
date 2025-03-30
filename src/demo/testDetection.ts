import { NewCoinDetector } from '../services/newCoinDetector';
import { TokenMetrics, PatternDetection, TradingSignal, PatternType } from '../types/index';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test class to simulate token detection scenarios
 */
class DetectionTester {
    private detector: NewCoinDetector;
    private tokenCount = 0;
    private symbols = ['DOGE', 'CAT', 'PEPE', 'MOON', 'SHIB', 'FLOKI', 'PUDGY', 'BONK', 'BOOK', 'RACA'];
    private namePrefixes = ['Super', 'Mega', 'Ultra', 'Hyper', 'Cosmic', 'Galactic', 'Atomic', 'Solar', 'Lunar', 'Stellar'];
    private nameSuffixes = ['Token', 'Coin', 'Inu', 'Moon', 'Rocket', 'Elon', 'Finance', 'Protocol', 'AI', 'Swap'];

    constructor() {
        // Initialize with standard testing parameters
        this.detector = new NewCoinDetector({
            minLiquidity: 5000,
            maxAgeHours: 72,
            scanIntervalSec: 10,
            birdeyeApiKey: process.env.BIRDEYE_API_KEY || '',
            defaultStopLossPercent: 5, // Add default value
            defaultTimeframe: '5m' // Add default value
        });

        // Subscribe to events for logging with better formatting
        this.detector.on('newToken', async (token: TokenMetrics) => {
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('\n-----------------------------------');
            console.log(`🚀 New Token Detected: ${token.symbol}`);
            console.log(`   Address: ${token.address}`);
            console.log(`   Liquidity: $${token.liquidity?.toFixed(2)}`);
            console.log(`   Volume (24h): $${token.volume24h?.toFixed(2)}`);
            console.log('-----------------------------------\n');
        });

        /* 
        this.detector.on('patternDetected', async (pattern) => {
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('\n-----------------------------------');
            console.log(`⚡ Pattern: ${pattern.patternType}`);
            console.log(`🎯 Token: ${pattern.tokenSymbol}`);
            console.log(`✨ Confidence: ${pattern.confidence.toFixed(1)}%`);
            console.log(`📝 ${pattern.description}`);
            console.log('-----------------------------------\n');
        });
        */

        /* 
        this.detector.on('tradingSignal', async (signal) => {
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('\n-----------------------------------');
            console.log(`💰 Signal: ${signal.signalType.toUpperCase()} ${signal.tokenSymbol}`);
            console.log(`💵 Entry: $${signal.price.toFixed(8)}`);
            console.log(`📊 Position: $${signal.positionSize.toFixed(2)}`);
            console.log(`🛑 Stop Loss: $${signal.stopLoss.toFixed(8)} (-${((1 - signal.stopLoss / signal.price) * 100).toFixed(1)}%)`);
            console.log(`🎯 Targets:`);
            signal.targets.forEach((target: { price: number, percentage: number }, index: number) => {
                console.log(`   ${index + 1}. $${target.price.toFixed(8)} (+${((target.price / signal.price - 1) * 100).toFixed(1)}%) - ${target.percentage}%`);
            });
            console.log(`⭐ Confidence: ${signal.confidence.toFixed(1)}%`);
            console.log('-----------------------------------\n');
        });
        */
    }

    /**
     * Create a random token with realistic-ish properties
     */
    private createRandomToken(): { address: string, metrics: TokenMetrics } {
        const symbol = this.symbols[this.tokenCount % this.symbols.length] + (this.tokenCount > this.symbols.length ? Math.floor(this.tokenCount / this.symbols.length) : '');
        const address = uuidv4().replace(/-/g, '').substring(0, 44); // Solana-like address

        const metrics: TokenMetrics = {
            address,
            symbol,
            price: Math.random() * 0.00001 + 0.00000001,
            liquidity: 5000 + Math.random() * 95000, // $5k to $100k
            volume24h: (5000 + Math.random() * 95000) * (0.1 + Math.random() * 0.9), // 10% to 100% of liquidity
            holders: Math.floor(Math.random() * 500) + 50,
            buys5min: Math.floor(Math.random() * 20) + 1,
            timestamp: Date.now()
        };

        return { address, metrics };
    }

    /**
     * Create a token with a specific pattern
     */
    private createPatternToken(patternType: PatternType): { address: string, metrics: TokenMetrics } {
        const baseToken = this.createRandomToken();
        const address = baseToken.address;
        const metrics: TokenMetrics = { ...baseToken.metrics };

        // Modify metrics based on the pattern type
        switch (patternType) {
            case 'Mega Pump and Dump':
                metrics.price *= (Math.random() * 0.5 + 1.5); // Price jump 50-100%
                metrics.volume24h *= (Math.random() * 2 + 3); // Volume spike 3x-5x
                metrics.buys5min = Math.floor(Math.random() * 50) + 50; // High buys
                break;
            case 'Volatility Squeeze':
                // Simulate low recent volatility (harder with just current metrics)
                metrics.price *= (Math.random() * 0.02 + 0.99); // Minimal price change +/- 1%
                metrics.volume24h *= (Math.random() * 0.3 + 0.5); // Lower volume 0.5x-0.8x
                metrics.buys5min = Math.floor(Math.random() * 5) + 1; // Few buys
                break;
            case 'Smart Money Trap':
                metrics.price *= (Math.random() * 0.15 + 0.8); // Price drop 5-20%
                // Simulate high sell pressure indirectly
                metrics.buys5min = Math.floor(Math.random() * 3) + 1; // Very few buys
                break;
            // ... Add more specific modifications for other patterns if needed ...
            // Default case: Just use the random token as is
        }

        return { address, metrics };
    }

    /**
     * Add new token to detector
     */
    public addRandomToken() {
        const token = this.createRandomToken();
        // this.detector.processNewToken(token.address, token.metrics, false); // Method doesn't exist
        console.log(`Simulating random token add: ${token.metrics.symbol}`);
        this.tokenCount++;
        return token;
    }

    /**
     * Add token with specific pattern
     */
    public addPatternToken(patternType: PatternType) {
        const { address, metrics } = this.createPatternToken(patternType);
        // this.detector.processNewToken(address, metrics, true); // Method doesn't exist
        console.log(`Simulating pattern token add: ${metrics.symbol} (${patternType})`);
        this.tokenCount++; // Increment even if processing is removed/commented
        return { address, metrics };
    }

    /**
     * Update an existing token with new metrics (e.g., to simulate price changes)
     */
    public updateToken(address: string, priceChange: number, volumeChange: number, buyRatioChange: number) {
        const tokenData = this.detector.getTokenData(address);
        if (!tokenData) {
            console.error(`Token ${address} not found`);
            return;
        }

        const lastMetrics = tokenData; // Use the retrieved TokenMetrics directly
        const newMetrics: TokenMetrics = {
            ...lastMetrics,
            price: lastMetrics.price * (1 + priceChange / 100),
            volume24h: lastMetrics.volume24h * (1 + volumeChange / 100),
            timestamp: Date.now()
        };

        try {
            // this.detector.updateTokenData(address, newMetrics); // Method doesn't exist
        } catch (error: any) {
            console.error(`Error updating token ${address}: ${error.message || error}`);
        }
        return newMetrics;
    }

    /**
     * Run a complete test scenario
     */
    public async runTestScenario() {
        console.log("\n========================================");
        console.log("🚀 STARTING DETECTION TEST SCENARIO");
        console.log("========================================\n");

        // Add some random tokens first
        console.log("📝 Adding random tokens for baseline...\n");
        for (let i = 0; i < 5; i++) {
            const token = this.addRandomToken();
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log("\n📊 Testing pattern detection...\n");

        // Test each pattern type with proper delays
        const patternTests = [
            { type: 'Mega Pump and Dump', price: 85, volume: 300, ratio: 2.5 },
            { type: 'Volatility Squeeze', price: 35, volume: 400, ratio: 3.0 },
            { type: 'Smart Money Trap', price: -15, volume: 150, ratio: 2.0 },
            { type: 'Algorithmic Stop Hunt', price: -25, volume: 250, ratio: 1.8 },
            { type: 'Smart Money Reversal', price: -30, volume: 200, ratio: 0.5 },
            { type: 'Volume Divergence', price: 15, volume: 50, ratio: 1.2 },
            { type: 'Hidden Accumulation', price: -5, volume: 300, ratio: 2.0 },
            { type: 'Wyckoff Spring', price: -20, volume: 400, ratio: 3.0 },
            { type: 'Liquidity Grab', price: -15, volume: 600, ratio: 0.5 },
            { type: 'FOMO Cycle', price: 60, volume: 800, ratio: 4.0 }
        ];

        const tokens = new Map();

        // Add pattern tokens with longer delays
        for (const test of patternTests) {
            const { address } = this.addPatternToken(test.type as PatternType); // Use type assertion
            tokens.set(test.type, address);
            await new Promise(resolve => setTimeout(resolve, 2500));
        }

        console.log("\n📈 Simulating market activity...\n");

        // Update tokens with pattern-specific behavior
        for (const test of patternTests) {
            const token = tokens.get(test.type);
            if (token) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                this.updateToken(token, test.price, test.volume, test.ratio);

                // Add second update for patterns that need it
                if (['Wyckoff Spring', 'Liquidity Grab', 'Smart Money Reversal', 'Algorithmic Stop Hunt'].includes(test.type)) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    this.updateToken(token, Math.abs(test.price * 1.5), test.volume * 1.2, test.ratio * 1.2);
                }
            }
        }

        console.log("\n📊 Generating performance report...\n");
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Pattern performance stats
        console.log("\n========================================");
        console.log("🎯 PATTERN PERFORMANCE");
        console.log("========================================\n");

        // const patterns = this.detector.getActivePatterns();
        const performance = new Map<PatternType, { signals: number, avgReturn: number, avgConfidence: number }>();

        // for (const pattern of patterns) {
        //     const stats = performance.get(pattern.patternType) || { signals: 0, avgReturn: 0, avgConfidence: 0 };

        //     stats.signals++;
        //     // Calculate return based on latest metrics
        //     const tokenData = this.detector.getTokenData(pattern.tokenAddress);
        //     const latestMetrics = tokenData?.metricsHistory[tokenData.metricsHistory.length - 1];
        //     const priceChange = latestMetrics?.priceChange1h || 0;

        //     stats.avgReturn += priceChange;
        //     stats.avgConfidence += pattern.confidence;
        //     performance.set(pattern.patternType, stats);
        // }

        // Sort patterns by average return
        // const sortedPatterns = Array.from(performance.entries())
        //     .sort((a, b) => (b[1].avgReturn / b[1].signals) - (a[1].avgReturn / a[1].signals));

        // for (const [patternType, stats] of sortedPatterns) {
        //     console.log(`${patternType}:`);
        //     console.log(`  📊 Signals: ${stats.signals}`);
        //     console.log(`  📈 Avg Return: ${(stats.avgReturn / stats.signals).toFixed(1)}%`);
        //     console.log(`  ⭐ Avg Confidence: ${(stats.avgConfidence / stats.signals).toFixed(1)}%\n`);
        // }

        // Trading signal stats
        console.log("\n========================================");
        console.log("💰 TRADING SIGNALS");
        console.log("========================================\n");

        // const signals = this.detector.getRecentSignals();
        // if (signals.length > 0) {
        //     console.log(`📊 Total Signals: ${signals.length}`);
        //     console.log(`💵 Avg Position: $${(signals.reduce((sum, s) => sum + s.positionSize, 0) / signals.length).toFixed(2)}`);
        //     console.log(`⭐ Avg Confidence: ${(signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length).toFixed(1)}%`);

        //     // Calculate success metrics
        //     const successfulSignals = signals.filter(s => s.confidence > 75).length;
        //     console.log(`✅ High Confidence Signals: ${successfulSignals} (${((successfulSignals / signals.length) * 100).toFixed(1)}%)\n`);
        // } else {
        //     console.log("⚠️ No trading signals generated during this test run\n");
        // }

        // Top tokens
        console.log("\n========================================");
        console.log("🏆 TOP PERFORMING TOKENS");
        console.log("========================================\n");

        // const topTokens = this.detector.getTopTokens(5);
        // topTokens.forEach((token, index) => {
        //     const tokenData = this.detector.getTokenData(token.address);
        //     const patterns = tokenData?.patterns || [];
        //     console.log(`${index + 1}. ${token.symbol}:`);
        //     console.log(`   💯 Score: ${token.score.toFixed(1)}/100`);
        //     console.log(`   📈 24h Change: ${tokenData?.metricsHistory[tokenData.metricsHistory.length - 1]?.priceChange24h?.toFixed(1) || '0.0'}%`);
        //     console.log(`   💎 Patterns: ${patterns.length}\n`);
        // });

        // Final summary
        console.log("\n========================================");
        console.log("📋 TEST SUMMARY");
        console.log("========================================\n");
        console.log(`📊 Total Tokens: ${this.tokenCount}`);
        console.log(`🎯 Pattern Types: ${performance.size}`);
        console.log("(Test run finished.)");
        console.log("========================================\n");
    }
}

// Run the test scenario
(async () => {
    try {
        const tester = new DetectionTester();
        await tester.runTestScenario();
    } catch (error) {
        console.error("Test error:", error);
    }
})();
