import fs from 'fs';
import path from 'path';
import { getRecentTradeStats } from './getRecentTradeStats.js';
import { analyticsConfig } from './config.js';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const TRADES_FILE = path.join(DATA_DIR, 'trades.jsonl');
function writeTrades(trades) {
    if (!fs.existsSync(DATA_DIR))
        fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TRADES_FILE, trades.map((t) => JSON.stringify(t)).join('\n'));
}
function nowMinus(minutes) {
    return Date.now() - minutes * 60 * 1000;
}
async function runTestCase(name, trades) {
    writeTrades(trades);
    const stats = await getRecentTradeStats(analyticsConfig.analyticsWindowMinutes * 60 * 1000);
    const buckets = stats.pnlBuckets || { gt10: 0, p0to10: 0, n0to10: 0, lt10: 0 };
    // Compose summary
    const realizedPnl = `${stats.realizedPnl.toFixed(2)}% (${stats.winCount} wins, ${stats.lossCount} losses, avg ${stats.avgPnl.toFixed(2)}%, ${stats.tradeCount} trades)`;
    const topWinner = stats.topWinner
        ? `${stats.topWinner.symbol} (${stats.topWinner.pnl.toFixed(2)}%)`
        : 'N/A';
    const topLoser = stats.topLoser
        ? `${stats.topLoser.symbol} (${stats.topLoser.pnl.toFixed(2)}%)`
        : 'N/A';
    const mostTraded = stats.mostTraded
        ? `${stats.mostTraded.symbol} (${stats.mostTraded.count} trades)`
        : 'N/A';
    const pnlDist = `>10%: ${buckets.gt10}, 0-10%: ${buckets.p0to10}, 0 to -10%: ${buckets.n0to10}, <-10%: ${buckets.lt10}`;
    const alerts = [];
    if (buckets.lt10 > 2) {
        alerts.push(`🚨 ALERT: ${buckets.lt10} trades with PnL worse than -10% in the last ${analyticsConfig.analyticsWindowMinutes}m. Review risk!`);
    }
    if (buckets.gt10 > 3) {
        alerts.push(`🔥 HOT STREAK: ${buckets.gt10} trades with PnL >10% in the last ${analyticsConfig.analyticsWindowMinutes}m!`);
    }
    console.log(`\n=== Test Case: ${name} ===`);
    console.log(`Summary:`);
    console.log(`Realized PnL: ${realizedPnl}`);
    console.log(`Top Winner: ${topWinner}`);
    console.log(`Top Loser: ${topLoser}`);
    console.log(`Most Traded: ${mostTraded}`);
    console.log(`PnL Distribution: ${pnlDist}`);
    if (alerts.length) {
        console.log('Alerts:');
        for (const a of alerts)
            console.log(a);
    }
    else {
        console.log('Alerts: None');
    }
    console.log('==========================\n');
}
async function main() {
    // 1. Normal case
    await runTestCase('Normal', [
        { timestamp: nowMinus(10), type: 'close', pnl: 2, tokenSymbol: 'BONK' },
        { timestamp: nowMinus(20), type: 'close', pnl: -3, tokenSymbol: 'DOGE' },
        { timestamp: nowMinus(30), type: 'close', pnl: 5, tokenSymbol: 'BONK' },
        { timestamp: nowMinus(40), type: 'close', pnl: 0, tokenSymbol: 'PEPE' },
    ]);
    // 2. Severe loss alert
    await runTestCase('Severe Loss', [
        { timestamp: nowMinus(5), type: 'close', pnl: -12, tokenSymbol: 'DOGE' },
        { timestamp: nowMinus(6), type: 'close', pnl: -15, tokenSymbol: 'BONK' },
        { timestamp: nowMinus(7), type: 'close', pnl: -20, tokenSymbol: 'PEPE' },
        { timestamp: nowMinus(8), type: 'close', pnl: 1, tokenSymbol: 'BONK' },
    ]);
    // 3. Hot streak alert
    await runTestCase('Hot Streak', [
        { timestamp: nowMinus(5), type: 'close', pnl: 12, tokenSymbol: 'DOGE' },
        { timestamp: nowMinus(6), type: 'close', pnl: 15, tokenSymbol: 'BONK' },
        { timestamp: nowMinus(7), type: 'close', pnl: 20, tokenSymbol: 'PEPE' },
        { timestamp: nowMinus(8), type: 'close', pnl: 11, tokenSymbol: 'BONK' },
        { timestamp: nowMinus(9), type: 'close', pnl: -2, tokenSymbol: 'BONK' },
    ]);
    // 4. No trades
    await runTestCase('No Trades', []);
}
main().catch(console.error);
//# sourceMappingURL=testAnalyticsAlerts.js.map