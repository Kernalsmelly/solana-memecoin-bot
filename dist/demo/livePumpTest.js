"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const livePriceFeed_1 = require("../utils/livePriceFeed");
const TOKENS_TO_TEST = [
    { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' },
    { address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', symbol: 'SAMO' },
    { address: '8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh', symbol: 'COPE' }
];
const MIN_PRICE_CHANGE = 5; // 5% minimum price change
const MIN_VOLUME_SPIKE = 200; // 200% volume increase
const BUY_RATIO_THRESHOLD = 1.5; // 50% more buys than sells
const MONITORING_DURATION = 15 * 60 * 1000; // 15 minutes
const UPDATE_INTERVAL = 60 * 1000; // Status update every minute
class PumpDetector {
    priceHistory = new Map();
    pumpEvents = [];
    feeds = new Map();
    startTime;
    statusInterval = null;
    constructor() {
        this.startTime = Date.now();
    }
    async start() {
        console.log('🚀 Starting extended live pump detection test (15 minutes)...\n');
        // Initialize feeds with delay between each
        for (const token of TOKENS_TO_TEST) {
            this.priceHistory.set(token.address, []);
            const feed = new livePriceFeed_1.LivePriceFeed(token.address);
            this.feeds.set(token.address, feed);
            feed.on('price', (data) => {
                this.handlePriceUpdate(token, data);
            });
            feed.on('error', (error) => {
                console.error(`Error with ${token.symbol}:`, error.message);
            });
            await feed.start();
            // Add delay between initializing feeds
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        // Print initial status
        this.printStatusUpdate();
        // Print status updates every minute
        this.statusInterval = setInterval(() => {
            this.printStatusUpdate();
        }, UPDATE_INTERVAL);
        // Run for 15 minutes
        setTimeout(() => this.stop(), MONITORING_DURATION);
    }
    handlePriceUpdate(token, data) {
        const history = this.priceHistory.get(token.address);
        if (!history)
            return;
        history.push(data);
        // Keep last 30 price points (5 minutes at 10s intervals)
        if (history.length > 30) {
            history.shift();
        }
        // Check for pump conditions
        if (history.length >= 2) {
            const lastPoint = history[history.length - 1];
            const firstPoint = history[0];
            if (!lastPoint?.price || !firstPoint?.price)
                return;
            const lastPrice = lastPoint.price;
            const startPrice = firstPoint.price;
            const priceChange = this.calculatePriceChange(history);
            const recentVolume = history.slice(-5).reduce((sum, p) => sum + (p.volume || 0), 0);
            const buyRatio = lastPoint.buyRatio || 0;
            console.log(`\n${token.symbol}:`);
            console.log(`- Price: $${lastPrice.toFixed(8)} (${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);
            console.log(`- Volume (5m): $${recentVolume.toFixed(2)}`);
            console.log(`- Buy/Sell Ratio: ${buyRatio.toFixed(2)}`);
            // Add momentum indicator
            const recentHistory = history.slice(-5);
            if (recentHistory.length >= 2) {
                const recentChange = this.calculatePriceChange(recentHistory);
                console.log(`- 1min Momentum: ${recentChange > 0 ? '+' : ''}${recentChange.toFixed(2)}%`);
            }
            if (this.isPumpDetected(priceChange, this.calculateVolumeSpike(history), buyRatio)) {
                const pumpEvent = {
                    token,
                    startPrice,
                    peakPrice: lastPrice,
                    priceChange,
                    volumeSpike: this.calculateVolumeSpike(history),
                    buyRatio,
                    duration: Math.floor((Date.now() - this.startTime) / 1000 / 60),
                    success: true
                };
                this.pumpEvents.push(pumpEvent);
                this.logPumpDetection(pumpEvent);
            }
        }
    }
    calculatePriceChange(history) {
        if (!history || history.length < 2)
            return 0;
        const lastPoint = history[history.length - 1];
        const firstPoint = history[0];
        if (!lastPoint?.price || !firstPoint?.price)
            return 0;
        return ((lastPoint.price - firstPoint.price) / firstPoint.price) * 100;
    }
    calculateVolumeSpike(history) {
        if (!history || history.length < 2)
            return 0;
        const avgVolume = history.slice(0, -1).reduce((sum, point) => sum + (point.volume || 0), 0) / (history.length - 1);
        const lastPoint = history[history.length - 1];
        if (!lastPoint?.volume)
            return 0;
        const currentVolume = lastPoint.volume;
        return ((currentVolume - avgVolume) / avgVolume) * 100;
    }
    isPumpDetected(priceChange, volumeSpike, buyRatio) {
        return (priceChange > MIN_PRICE_CHANGE &&
            volumeSpike > MIN_VOLUME_SPIKE &&
            buyRatio > BUY_RATIO_THRESHOLD);
    }
    logPumpDetection(event) {
        console.log('\n🚨 PUMP DETECTED! 🚨');
        console.log('==================');
        console.log(`Token: ${event.token.symbol}`);
        console.log(`Price Change: ${event.priceChange.toFixed(2)}%`);
        console.log(`Volume Spike: ${event.volumeSpike.toFixed(2)}%`);
        console.log(`Buy/Sell Ratio: ${event.buyRatio.toFixed(2)}`);
        console.log(`Time to Detection: ${event.duration} minutes`);
        console.log(`Start Price: $${event.startPrice.toFixed(6)}`);
        console.log(`Current Price: $${event.peakPrice.toFixed(6)}`);
        console.log('==================\n');
    }
    printStatusUpdate() {
        const elapsedMinutes = Math.floor((Date.now() - this.startTime) / 60000);
        const remainingMinutes = 15 - elapsedMinutes;
        console.log('\n📊 Status Update');
        console.log(`Time Elapsed: ${elapsedMinutes} minutes (${remainingMinutes} remaining)`);
        console.log('==================');
        for (const token of TOKENS_TO_TEST) {
            const history = this.priceHistory.get(token.address);
            if (history && history.length >= 2) {
                const lastPoint = history[history.length - 1];
                const firstPoint = history[0];
                if (!lastPoint?.price || !firstPoint?.price)
                    continue;
                const lastPrice = lastPoint.price;
                const startPrice = firstPoint.price;
                const priceChange = this.calculatePriceChange(history);
                const recentVolume = history.slice(-5).reduce((sum, p) => sum + (p.volume || 0), 0);
                const buyRatio = lastPoint.buyRatio || 0;
                console.log(`\n${token.symbol}:`);
                console.log(`- Price: $${lastPrice.toFixed(8)} (${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);
                console.log(`- Recent Volume: $${recentVolume.toFixed(2)}`);
                console.log(`- Buy/Sell Ratio: ${buyRatio.toFixed(2)}`);
                // Add momentum indicator
                const recentHistory = history.slice(-5);
                if (recentHistory.length >= 2) {
                    const recentChange = this.calculatePriceChange(recentHistory);
                    console.log(`- 1min Momentum: ${recentChange > 0 ? '+' : ''}${recentChange.toFixed(2)}%`);
                }
            }
        }
        if (this.pumpEvents.length > 0) {
            console.log('\n🚨 Pump Events Detected:', this.pumpEvents.length);
            this.pumpEvents.forEach((event, index) => {
                console.log(`\n${index + 1}. ${event.token.symbol}:`);
                console.log(`   - Price Change: ${event.priceChange.toFixed(2)}%`);
                console.log(`   - Volume Spike: ${event.volumeSpike.toFixed(2)}%`);
                console.log(`   - Buy/Sell Ratio: ${event.buyRatio.toFixed(2)}`);
                console.log(`   - Duration: ${event.duration} minutes`);
            });
        }
        console.log('\n==================');
    }
    printSummary() {
        console.log('\nToken Performance Summary');
        console.log('==================');
        for (const token of TOKENS_TO_TEST) {
            const history = this.priceHistory.get(token.address);
            if (!history || history.length < 2)
                continue;
            const lastPoint = history[history.length - 1];
            const firstPoint = history[0];
            if (!lastPoint?.price || !firstPoint?.price)
                continue;
            const lastPrice = lastPoint.price;
            const startPrice = firstPoint.price;
            const priceChange = this.calculatePriceChange(history);
            const volumeSpike = this.calculateVolumeSpike(history);
            console.log(`\n${token.symbol}:`);
            console.log(`- Price: $${lastPrice.toFixed(8)} (${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);
            console.log(`- Volume Change: ${volumeSpike > 0 ? '+' : ''}${volumeSpike.toFixed(2)}%`);
        }
    }
    printAnalysisSummary() {
        console.log('\nAnalysis Summary');
        console.log('==================');
        for (const token of TOKENS_TO_TEST) {
            const tokenPumps = this.pumpEvents.filter(e => e.token.address === token.address);
            const history = this.priceHistory.get(token.address);
            if (!history || history.length < 2)
                continue;
            const lastPoint = history[history.length - 1];
            const firstPoint = history[0];
            if (!lastPoint?.price || !firstPoint?.price)
                continue;
            const lastPrice = lastPoint.price;
            const startPrice = firstPoint.price;
            const priceChange = this.calculatePriceChange(history);
            const volumeSpike = this.calculateVolumeSpike(history);
            console.log(`\n🔍 ${token.symbol} Analysis:`);
            console.log(`- Pump Events: ${tokenPumps.length}`);
            console.log(`- Total Price Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
            console.log(`- Average Volume: $${volumeSpike.toFixed(2)}`);
            if (tokenPumps.length > 0) {
                const successfulPumps = tokenPumps.filter(p => p.success);
                console.log(`- Success Rate: ${((successfulPumps.length / tokenPumps.length) * 100).toFixed(2)}%`);
            }
        }
    }
    stop() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        console.log('\n📊 Final Results Summary:');
        console.log('======================');
        // Stop all feeds
        for (const [address, feed] of this.feeds) {
            feed.stop();
        }
        // Print results
        console.log(`\nTotal Duration: 15 minutes`);
        console.log(`Total Pump Events: ${this.pumpEvents.length}`);
        for (const token of TOKENS_TO_TEST) {
            const tokenPumps = this.pumpEvents.filter(e => e.token.address === token.address);
            const history = this.priceHistory.get(token.address);
            console.log(`\n🔍 ${token.symbol} Analysis:`);
            console.log(`- Pump Events: ${tokenPumps.length}`);
            if (history && history.length >= 2) {
                const lastPoint = history[history.length - 1];
                const firstPoint = history[0];
                if (!lastPoint?.price || !firstPoint?.price)
                    continue;
                const lastPrice = lastPoint.price;
                const startPrice = firstPoint.price;
                const priceChange = this.calculatePriceChange(history);
                const volumeSpike = this.calculateVolumeSpike(history);
                console.log(`- Total Price Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
                console.log(`- Average Volume: $${volumeSpike.toFixed(2)}`);
            }
        }
        this.printSummary();
        this.printAnalysisSummary();
        process.exit(0);
    }
}
// Start the live test
new PumpDetector().start().catch(console.error);
//# sourceMappingURL=livePumpTest.js.map