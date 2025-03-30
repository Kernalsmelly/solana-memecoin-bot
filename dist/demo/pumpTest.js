"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Test scenarios based on real pump patterns
const TEST_SCENARIOS = [
    {
        name: 'Mega Pump',
        priceChanges: [2, 3, 5, 8, 15, 25, 40, 35, 30, 25],
        volumeChanges: [150, 200, 400, 800, 1200, 1000, 800, 600, 400, 300],
        buyRatios: [1.2, 1.4, 1.8, 2.2, 2.5, 2.3, 2.0, 1.8, 1.5, 1.3],
        expectedPumps: 1
    },
    {
        name: 'Smart Money Accumulation',
        priceChanges: [1, 1.5, 2, 3, 4, 6, 10, 15, 12, 10],
        volumeChanges: [100, 120, 150, 200, 300, 500, 800, 1000, 800, 600],
        buyRatios: [1.1, 1.2, 1.3, 1.5, 1.8, 2.0, 2.2, 2.0, 1.8, 1.5],
        expectedPumps: 1
    },
    {
        name: 'False Breakout',
        priceChanges: [1, 2, 4, 6, 3, 2, 1.5, 1, 0.8, 0.7],
        volumeChanges: [100, 150, 300, 500, 800, 600, 400, 300, 200, 150],
        buyRatios: [1.2, 1.4, 1.6, 1.8, 1.2, 0.8, 0.6, 0.5, 0.4, 0.3],
        expectedPumps: 0
    },
    {
        name: 'Stealth Accumulation',
        priceChanges: [0.5, 0.8, 1, 1.2, 1.5, 2, 3, 5, 8, 12],
        volumeChanges: [50, 80, 100, 150, 200, 300, 500, 800, 1200, 1500],
        buyRatios: [1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.5],
        expectedPumps: 1
    },
    {
        name: 'Volume Trap',
        priceChanges: [1, 1.5, 2, 1.8, 1.5, 1.2, 1, 0.8, 0.7, 0.6],
        volumeChanges: [100, 300, 500, 800, 600, 400, 300, 200, 150, 100],
        buyRatios: [1.3, 1.5, 1.7, 1.2, 0.9, 0.7, 0.5, 0.4, 0.3, 0.2],
        expectedPumps: 0
    }
];
const MIN_PRICE_CHANGE = 5; // 5% minimum price change
const MIN_VOLUME_SPIKE = 200; // 200% volume increase
const BUY_RATIO_THRESHOLD = 1.5; // 50% more buys than sells
function detectPump(priceChange, volumeSpike, buyRatio) {
    return (priceChange > MIN_PRICE_CHANGE &&
        volumeSpike > MIN_VOLUME_SPIKE &&
        buyRatio > BUY_RATIO_THRESHOLD);
}
function runScenarioTest(scenario) {
    let detectedPumps = 0;
    let falsePositives = 0;
    let firstPumpTime = -1;
    let totalPriceChange = 0;
    let totalVolumeSpike = 0;
    let totalBuyRatio = 0;
    let samples = 0;
    // Base values for calculating changes
    let basePrice = 100;
    let baseVolume = 1000;
    for (let i = 0; i < scenario.priceChanges.length; i++) {
        const priceChange = scenario.priceChanges[i];
        const volumeSpike = scenario.volumeChanges[i];
        const buyRatio = scenario.buyRatios[i];
        totalPriceChange += priceChange;
        totalVolumeSpike += volumeSpike;
        totalBuyRatio += buyRatio;
        samples++;
        const isPump = detectPump(priceChange, volumeSpike, buyRatio);
        if (isPump) {
            if (firstPumpTime === -1) {
                firstPumpTime = i;
            }
            // Check if this pump was expected
            if (scenario.expectedPumps > 0 && detectedPumps < scenario.expectedPumps) {
                detectedPumps++;
            }
            else {
                falsePositives++;
            }
            console.log(`\n🚨 Pump detected in scenario "${scenario.name}" at step ${i + 1}:`);
            console.log(`- Price Change: ${priceChange.toFixed(2)}%`);
            console.log(`- Volume Spike: ${volumeSpike.toFixed(2)}%`);
            console.log(`- Buy/Sell Ratio: ${buyRatio.toFixed(2)}`);
        }
        // Update base values
        basePrice *= (1 + priceChange / 100);
        baseVolume *= (1 + volumeSpike / 100);
    }
    return {
        scenario: scenario.name,
        detectedPumps,
        expectedPumps: scenario.expectedPumps,
        accuracy: scenario.expectedPumps > 0 ? detectedPumps / scenario.expectedPumps : 1,
        avgPriceChange: totalPriceChange / samples,
        avgVolumeSpike: totalVolumeSpike / samples,
        avgBuyRatio: totalBuyRatio / samples,
        falsePositives,
        timeToDetection: firstPumpTime === -1 ? -1 : firstPumpTime + 1
    };
}
function printTestResults(results) {
    console.log('\n📊 Test Results Summary:');
    console.log('======================');
    let totalAccuracy = 0;
    let scenarios = 0;
    results.forEach(result => {
        console.log(`\n🔍 Scenario: ${result.scenario}`);
        console.log(`- Detection Rate: ${(result.accuracy * 100).toFixed(2)}%`);
        console.log(`- Pumps Found: ${result.detectedPumps}/${result.expectedPumps}`);
        console.log(`- False Positives: ${result.falsePositives}`);
        console.log(`- Avg Price Change: ${result.avgPriceChange.toFixed(2)}%`);
        console.log(`- Avg Volume Spike: ${result.avgVolumeSpike.toFixed(2)}%`);
        console.log(`- Avg Buy Ratio: ${result.avgBuyRatio.toFixed(2)}`);
        if (result.timeToDetection > 0) {
            console.log(`- Time to Detection: ${result.timeToDetection} intervals`);
        }
        totalAccuracy += result.accuracy;
        scenarios++;
    });
    console.log('\n📈 Overall Performance:');
    console.log(`- Average Accuracy: ${((totalAccuracy / scenarios) * 100).toFixed(2)}%`);
    console.log(`- Total Scenarios: ${scenarios}`);
}
function runTests() {
    console.log('🧪 Starting pump detection tests...\n');
    const results = TEST_SCENARIOS.map(scenario => {
        console.log(`Testing scenario: ${scenario.name}...`);
        return runScenarioTest(scenario);
    });
    printTestResults(results);
}
runTests();
