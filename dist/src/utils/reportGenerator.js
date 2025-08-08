// src/utils/reportGenerator.ts
// Summarizes and visualizes analytics for actual vs missed profit, parameter evolution, and pool leaderboards
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
// Helper to format USD
function usd(n) {
    return `$${n.toFixed(2)}`;
}
// Load missed opportunity results
const missedFile = path.resolve(__dirname, '..', '..', 'data', 'missed_opportunities.csv');
const leaderboardFile = path.resolve(__dirname, '..', '..', 'data', 'parameter_leaderboard.csv');
function loadCsv(file) {
    if (!fs.existsSync(file))
        return [];
    const csv = fs.readFileSync(file, 'utf-8');
    return parse(csv, { columns: true, skip_empty_lines: true });
}
function generateReport() {
    const missed = loadCsv(missedFile);
    const leaderboard = loadCsv(leaderboardFile);
    if (!missed.length) {
        console.log('[Report] No missed opportunity data found.');
        return;
    }
    // Top missed pools by best simulated P/L
    const topMissed = missed
        .slice()
        .sort((a, b) => Number(b.pnlBest1h) - Number(a.pnlBest1h))
        .slice(0, 10);
    console.log('\n=== Missed Opportunity Report ===');
    topMissed.forEach((r, i) => {
        console.log(`${i + 1}. ${r.token} | Pool: ${r.poolAddress} | Entry: $${Number(r.detectionPrice).toFixed(6)} | Best1h: $${Number(r.best1h).toFixed(6)} | BestP/L: ${usd(Number(r.pnlBest1h))}`);
    });
    const totalMissedBest1h = missed.reduce((a, r) => a + Number(r.pnlBest1h), 0);
    const totalMissed15m = missed.reduce((a, r) => a + Number(r.pnl15m), 0);
    const totalMissed1h = missed.reduce((a, r) => a + Number(r.pnl1h), 0);
    console.log(`\nTotal missed profit (Best 1h): ${usd(totalMissedBest1h)}`);
    console.log(`Total missed profit (1h): ${usd(totalMissed1h)}`);
    console.log(`Total missed profit (15m): ${usd(totalMissed15m)}`);
    // Parameter leaderboard summary
    if (leaderboard.length) {
        const best = leaderboard[0];
        console.log('\n=== Parameter Leaderboard (Best Config) ===');
        console.log(`minLiquidity: $${best.minLiquidity}, minVolume: $${best.minVolume}, minVLratio: ${best.minVLratio}`);
        console.log(`Detected: ${best.detected}, Traded: ${best.tradedPools}, Total P/L: ${usd(Number(best.totalPL))}, Avg P/L: ${usd(Number(best.avgPL))}, WinRate: ${(Number(best.winRate) * 100).toFixed(2)}%`);
    }
}
if (require.main === module) {
    generateReport();
}
//# sourceMappingURL=reportGenerator.js.map