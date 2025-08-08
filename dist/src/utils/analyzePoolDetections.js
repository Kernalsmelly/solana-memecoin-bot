// Utility to analyze pool_detection_log.csv for missed high-liquidity/volume pools and summary stats
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
const poolLogFile = path.resolve(__dirname, '..', '..', 'data', 'pool_detection_log.csv');
const tradeLogFile = path.resolve(__dirname, '..', '..', 'data', 'trade_log.csv');
function parseNumber(val) {
    if (!val)
        return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
}
import { loadPriceHistory, getWindowedPrices } from './priceHistoryUtils.js';
function main() {
    if (!fs.existsSync(poolLogFile)) {
        console.error('No pool_detection_log.csv found!');
        return;
    }
    if (!fs.existsSync(tradeLogFile)) {
        console.error('No trade_log.csv found!');
        return;
    }
    const poolCsv = fs.readFileSync(poolLogFile, 'utf-8');
    const tradeCsv = fs.readFileSync(tradeLogFile, 'utf-8');
    const pools = parse(poolCsv, { columns: true, skip_empty_lines: true }).map((row) => ({
        ...row,
        liquidityUsd: parseNumber(row.liquidityUsd),
        volume24hUsd: parseNumber(row.volume24hUsd),
    }));
    const trades = parse(tradeCsv, { columns: true, skip_empty_lines: true });
    // Build a set of traded pool addresses or token mints
    const tradedPoolAddresses = new Set();
    const tradedTokens = new Set();
    for (const t of trades) {
        if (t.pairAddress)
            tradedPoolAddresses.add(t.pairAddress);
        if (t.token)
            tradedTokens.add(t.token);
    }
    // Mark pools as traded or not
    for (const p of pools) {
        p.wasTraded =
            tradedPoolAddresses.has(p.poolAddress || '') || tradedTokens.has(p.baseMint || '');
    }
    // Summary stats
    const total = pools.length;
    const avgLiquidity = pools.reduce((a, b) => a + b.liquidityUsd, 0) / (total || 1);
    const avgVolume = pools.reduce((a, b) => a + b.volume24hUsd, 0) / (total || 1);
    // Split into traded/untraded
    const traded = pools.filter((p) => p.wasTraded);
    const untraded = pools.filter((p) => !p.wasTraded);
    const avgTradedLiquidity = traded.reduce((a, b) => a + b.liquidityUsd, 0) / (traded.length || 1);
    const avgUntradedLiquidity = untraded.reduce((a, b) => a + b.liquidityUsd, 0) / (untraded.length || 1);
    const avgTradedVolume = traded.reduce((a, b) => a + b.volume24hUsd, 0) / (traded.length || 1);
    const avgUntradedVolume = untraded.reduce((a, b) => a + b.volume24hUsd, 0) / (untraded.length || 1);
    // Top missed (untraded) high-liquidity/volume pools
    const topMissed = untraded
        .filter((p) => p.liquidityUsd > 50000 && p.volume24hUsd > 10000)
        .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
        .slice(0, 5);
    // --- Profitability Analysis for Traded Pools ---
    // Group trades by poolAddress or token
    const poolTradeStats = {};
    for (const t of trades) {
        if (t.action !== 'buy' && t.action !== 'sell')
            continue;
        const key = t.pairAddress || t.token;
        if (!key)
            continue;
        if (!poolTradeStats[key])
            poolTradeStats[key] = { pnlSum: 0, winCount: 0, tradeCount: 0 };
        const stats = poolTradeStats[key];
        const pnl = Number(t.pnl ?? 0);
        stats.pnlSum += pnl;
        if (pnl > 0)
            stats.winCount++;
        stats.tradeCount++;
    }
    const tradedPoolKeys = Object.keys(poolTradeStats);
    const avgPL = tradedPoolKeys.length
        ? tradedPoolKeys.reduce((a, k) => a + (Number(poolTradeStats[k]?.pnlSum) || 0), 0) / (tradedPoolKeys.length || 1)
        : 0;
    const winRate = tradedPoolKeys.length
        ? tradedPoolKeys.reduce((a, k) => a +
            (Number(poolTradeStats[k]?.winCount) / (Number(poolTradeStats[k]?.tradeCount) || 1) || 0), 0) / (tradedPoolKeys.length || 1)
        : 0;
    // --- Parameter Tuning Suggestions ---
    function median(arr) {
        // Filter out undefined, null, and NaN just in case
        const filtered = arr.filter((n) => typeof n === 'number' && !isNaN(n));
        if (filtered.length === 0)
            return 0;
        const sorted = filtered.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    const missedLiquidity = untraded
        .reduce((acc, p) => {
        if (typeof p.liquidityUsd === 'number' &&
            isFinite(p.liquidityUsd) &&
            !isNaN(p.liquidityUsd) &&
            p.liquidityUsd > 0) {
            acc.push(p.liquidityUsd);
        }
        return acc;
    }, [])
        .filter((n) => typeof n === 'number' && !isNaN(n));
    const missedVolume = untraded
        .reduce((acc, p) => {
        if (typeof p.volume24hUsd === 'number' &&
            isFinite(p.volume24hUsd) &&
            !isNaN(p.volume24hUsd) &&
            p.volume24hUsd > 0) {
            acc.push(p.volume24hUsd);
        }
        return acc;
    }, [])
        .filter((n) => typeof n === 'number' && !isNaN(n));
    const missedVLratio = untraded
        .reduce((acc, p) => {
        if (typeof p.liquidityUsd === 'number' &&
            isFinite(p.liquidityUsd) &&
            !isNaN(p.liquidityUsd) &&
            p.liquidityUsd > 0 &&
            typeof p.volume24hUsd === 'number' &&
            isFinite(p.volume24hUsd) &&
            !isNaN(p.volume24hUsd) &&
            p.volume24hUsd > 0) {
            const val = p.volume24hUsd / p.liquidityUsd;
            if (typeof val === 'number' && isFinite(val) && !isNaN(val) && val > 0) {
                acc.push(val);
            }
        }
        return acc;
    }, [])
        .filter((n) => typeof n === 'number' && !isNaN(n));
    const safeMissedLiquidity = missedLiquidity.filter((n) => typeof n === 'number' && !isNaN(n));
    const safeMissedVolume = missedVolume.filter((n) => typeof n === 'number' && !isNaN(n));
    const safeMissedVLratio = missedVLratio.filter((n) => typeof n === 'number' && !isNaN(n));
    const suggestedMinLiquidity = safeMissedLiquidity.length > 0 ? Math.min(...safeMissedLiquidity, 100000) : 100000;
    const suggestedMinVolume = safeMissedVolume.length > 0 ? Math.min(...safeMissedVolume, 10000) : 10000;
    const suggestedMinVLratio = safeMissedVLratio.length > 0 ? Math.min(...safeMissedVLratio, 0.05) : 0.05;
    // Current config values (from memory)
    const currentMinLiquidity = 100000;
    const currentMinVolume = 10000; // Not always in config, but for reporting
    const currentMinVLratio = 0.05;
    console.log('--- Pool Detection Analysis ---');
    console.log('Total pools detected:', total);
    console.log('Average liquidity (USD):', avgLiquidity.toFixed(2));
    console.log('Average 24h volume (USD):', avgVolume.toFixed(2));
    console.log('Traded pools:', traded.length, '| Untraded pools:', untraded.length);
    console.log('Avg traded liquidity:', avgTradedLiquidity.toFixed(2), '| Avg untraded liquidity:', avgUntradedLiquidity.toFixed(2));
    console.log('Avg traded 24h vol:', avgTradedVolume.toFixed(2), '| Avg untraded 24h vol:', avgUntradedVolume.toFixed(2));
    console.log('Top 5 high-liquidity/volume missed pools:');
    topMissed.forEach((p, i) => {
        console.log(`${i + 1}. ${p.tokenSymbol || p.baseMint} / ${p.quoteMint} | Liquidity: $${p.liquidityUsd} | 24h Vol: $${p.volume24hUsd}`);
    });
    console.log('\n--- Profitability Analysis for Traded Pools ---');
    console.log('Avg P/L per traded pool:', avgPL.toFixed(4));
    console.log('Win rate per traded pool:', (winRate * 100).toFixed(2) + '%');
    console.log('Total traded pools:', tradedPoolKeys.length);
    console.log('\n--- Parameter Tuning Suggestions ---');
    console.log('Current min liquidity:', currentMinLiquidity, '| Suggested (to capture missed):', suggestedMinLiquidity);
    console.log('Current min 24h volume:', currentMinVolume, '| Suggested (to capture missed):', suggestedMinVolume);
    console.log('Current min volume/liquidity ratio:', currentMinVLratio, '| Suggested:', suggestedMinVLratio.toFixed(4));
    // Ensure arrays passed to median are number[]
    console.log('Median missed liquidity:', median(safeMissedLiquidity).toFixed(2));
    console.log('Median missed 24h volume:', median(safeMissedVolume).toFixed(2));
    console.log('Median missed V/L ratio:', median(safeMissedVLratio).toFixed(4));
    // --- Parameter Sweep & Auto-Config Update ---
    const leaderboardRaw = parameterSweep(pools, trades);
    const leaderboard = Array.isArray(leaderboardRaw) ? leaderboardRaw : [];
    if (leaderboard.length > 0) {
        const best = leaderboard[0];
        const autoConfig = {
            minLiquidity: best.minLiquidity,
            minVolume: best.minVolume,
            minVLratio: best.minVLratio,
        };
        fs.writeFileSync(path.resolve(__dirname, '../../autoConfig.json'), JSON.stringify(autoConfig, null, 2));
        // Also export leaderboard as CSV
        const leaderboardCsv = [
            'minLiquidity,minVolume,minVLratio,detected,tradedPools,totalPL,avgPL,winRate',
            ...leaderboard.map((r) => `${r.minLiquidity},${r.minVolume},${r.minVLratio},${r.detected},${r.tradedPools},${r.totalPL},${r.avgPL},${r.winRate}`),
        ].join('\n');
        fs.writeFileSync(path.resolve(__dirname, '../../data/parameter_leaderboard.csv'), leaderboardCsv);
        console.log('\nBest-performing config written to autoConfig.json. Full leaderboard exported to data/parameter_leaderboard.csv');
        // --- Missed Opportunity Simulation with Price History ---
        const priceHistory = loadPriceHistory();
        const missedSimResults = [];
        let totalMissedProfit15m = 0, totalMissedProfit1h = 0, totalMissedProfitBest1h = 0;
        const positionSize = 50; // Simulate $50 position
        const window15m = 15 * 60 * 1000;
        const window1h = 60 * 60 * 1000;
        const missedPools = untraded.filter((p) => p.liquidityUsd >= best.minLiquidity &&
            p.volume24hUsd >= best.minVolume &&
            p.volume24hUsd / (p.liquidityUsd || 1) >= best.minVLratio);
        for (const pool of missedPools) {
            const detectionPriceRaw = pool.priceUsd || pool.price || '';
            const detectionTimeRaw = pool.timestamp || pool.detectedAt || '';
            const detectionPrice = parseNumber(detectionPriceRaw);
            const detectionTime = parseNumber(detectionTimeRaw);
            if (typeof detectionPrice !== 'number' ||
                isNaN(detectionPrice) ||
                detectionPrice <= 0 ||
                typeof detectionTime !== 'number' ||
                isNaN(detectionTime) ||
                detectionTime <= 0) {
                continue;
            }
            // Get price history rows for this pool after detection
            const phRows15m = getWindowedPrices(priceHistory, pool.baseMint || '', pool.poolAddress, detectionTime, window15m);
            const phRows1h = getWindowedPrices(priceHistory, pool.baseMint || '', pool.poolAddress, detectionTime, window1h);
            // Strategy 1: Sell after 15min
            const lastRow15m = phRows15m.length > 0 ? phRows15m[phRows15m.length - 1] : undefined;
            const exit15m = lastRow15m && lastRow15m.price !== undefined ? lastRow15m.price : detectionPrice;
            // Strategy 2: Sell after 1hr
            const lastRow1h = phRows1h.length > 0 ? phRows1h[phRows1h.length - 1] : undefined;
            const exit1h = lastRow1h && lastRow1h.price !== undefined ? lastRow1h.price : detectionPrice;
            // Strategy 3: Best price in 1hr window
            const best1h = phRows1h.length > 0
                ? Math.max(...phRows1h
                    .map((r) => r.price)
                    .filter((p) => typeof p === 'number' && !isNaN(p)))
                : detectionPrice;
            // Simulate P/L for each
            const pnl15m = ((exit15m - detectionPrice) / detectionPrice) * positionSize;
            const pnl1h = ((exit1h - detectionPrice) / detectionPrice) * positionSize;
            const pnlBest1h = ((best1h - detectionPrice) / detectionPrice) * positionSize;
            totalMissedProfit15m += pnl15m;
            totalMissedProfit1h += pnl1h;
            totalMissedProfitBest1h += pnlBest1h;
            missedSimResults.push({
                token: pool.tokenSymbol || pool.baseMint,
                poolAddress: pool.poolAddress,
                detectionPrice,
                detectionTime,
                exit15m,
                pnl15m,
                exit1h,
                pnl1h,
                best1h,
                pnlBest1h,
                liquidityUsd: pool.liquidityUsd,
                volume24hUsd: pool.volume24hUsd,
            });
        }
        // After the loop, report and export
        if (missedSimResults.length > 0) {
            missedSimResults.sort((a, b) => b.pnlBest1h - a.pnlBest1h);
            const totalMissedProfit15m = missedSimResults.reduce((sum, r) => sum + (r.pnl15m ?? 0), 0);
            const totalMissedProfit1h = missedSimResults.reduce((sum, r) => sum + (r.pnl1h ?? 0), 0);
            const totalMissedProfitBest1h = missedSimResults.reduce((sum, r) => sum + (r.pnlBest1h ?? 0), 0);
            console.log('\n--- Missed Opportunity Simulation (Top 10 by Best 1hr Sim P/L) ---');
            missedSimResults.slice(0, 10).forEach((r, i) => {
                console.log(`${i + 1}. ${r.token} | Pool: ${r.poolAddress} | Entry: $${r.detectionPrice.toFixed(6)} | Exit15m: $${r.exit15m.toFixed(6)} | P/L15m: $${r.pnl15m.toFixed(2)} | Exit1h: $${r.exit1h.toFixed(6)} | P/L1h: $${r.pnl1h.toFixed(2)} | Best1h: $${r.best1h.toFixed(6)} | BestP/L: $${r.pnlBest1h.toFixed(2)} | L: $${r.liquidityUsd} | V: $${r.volume24hUsd}`);
            });
            console.log(`Total simulated missed profit (15m): $${totalMissedProfit15m.toFixed(2)}`);
            console.log(`Total simulated missed profit (1h): $${totalMissedProfit1h.toFixed(2)}`);
            console.log(`Total simulated missed profit (Best 1h): $${totalMissedProfitBest1h.toFixed(2)}`);
            // Export missed opportunities to CSV
            const missedCsv = [
                'token,poolAddress,detectionPrice,detectionTime,exit15m,pnl15m,exit1h,pnl1h,best1h,pnlBest1h,liquidityUsd,volume24hUsd',
                ...missedSimResults.map((r) => `${r.token},${r.poolAddress},${r.detectionPrice},${r.detectionTime},${r.exit15m},${r.pnl15m},${r.exit1h},${r.pnl1h},${r.best1h},${r.pnlBest1h},${r.liquidityUsd},${r.volume24hUsd}`),
            ].join('\n');
            fs.writeFileSync(path.resolve(__dirname, '../../data/missed_opportunities.csv'), missedCsv);
            console.log('Missed opportunity simulation exported to data/missed_opportunities.csv');
        }
    }
}
function parameterSweep(pools, trades) {
    const liquidityRange = [20000, 50000, 100000, 150000, 200000];
    const volumeRange = [5000, 10000, 20000, 50000, 100000];
    const vlRatioRange = [0.01, 0.02, 0.05, 0.08, 0.1];
    const poolTradeStats = {};
    for (const t of trades) {
        if (t.action !== 'buy' && t.action !== 'sell')
            continue;
        const key = t.pairAddress || t.token;
        if (!key)
            continue;
        if (!poolTradeStats[key])
            poolTradeStats[key] = { pnlSum: 0, winCount: 0, tradeCount: 0 };
        const stats = poolTradeStats[key];
        const pnl = Number(t.pnl ?? 0);
        stats.pnlSum += pnl;
        if (pnl > 0)
            stats.winCount++;
        stats.tradeCount++;
    }
    const results = [];
    for (const minLiquidity of liquidityRange) {
        for (const minVolume of volumeRange) {
            for (const minVLratio of vlRatioRange) {
                const detected = pools.filter((p) => p.liquidityUsd >= minLiquidity &&
                    p.volume24hUsd >= minVolume &&
                    p.volume24hUsd / (p.liquidityUsd || 1) >= minVLratio);
                const detectedKeys = new Set(detected.map((p) => p.poolAddress || p.baseMint || ''));
                let totalPL = 0, totalTrades = 0, totalWins = 0, tradedPools = 0;
                for (const key of detectedKeys) {
                    if (poolTradeStats[key]) {
                        totalPL += Number(poolTradeStats[key]?.pnlSum) || 0;
                        totalWins += Number(poolTradeStats[key]?.winCount) || 0;
                        totalTrades += Number(poolTradeStats[key]?.tradeCount) || 0;
                        tradedPools++;
                    }
                }
                results.push({
                    minLiquidity: Number(minLiquidity) || 0,
                    minVolume: Number(minVolume) || 0,
                    minVLratio: Number(minVLratio) || 0,
                    detected: detected.length || 0,
                    tradedPools: tradedPools || 0,
                    totalPL: typeof totalPL === 'number' ? totalPL : 0,
                    avgPL: tradedPools ? (typeof totalPL === 'number' ? totalPL : 0) / tradedPools : 0,
                    winRate: tradedPools ? totalWins / totalTrades || 0 : 0,
                });
            }
        }
    }
    return results;
}
main();
//# sourceMappingURL=analyzePoolDetections.js.map