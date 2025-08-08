import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { parse as csvParse } from 'csv-parse';
import minimist from 'minimist';
import logger from '../src/utils/logger.js';
async function loadOHLCV(csvPath) {
    const content = fs.readFileSync(csvPath, 'utf8');
    return new Promise((resolve, reject) => {
        csvParse(content, { columns: true, skip_empty_lines: true }, (err, records) => {
            if (err)
                return reject(err);
            console.log('[DEBUG] Parsed records:', records.length, records[0]);
            resolve(records.map((r) => ({
                timestamp: Number(r.timestamp),
                open: Number(r.open),
                high: Number(r.high),
                low: Number(r.low),
                close: Number(r.close),
                volume: Number(r.volume),
            })));
        });
    });
}
// TODO: Implement txSendLatency
// txSendLatency.observe(latency);
async function main() {
    const argv = minimist(process.argv.slice(2));
    const ohlcvPath = argv['csv'] || 'data/ohlcv.csv';
    // Sweep mode
    if (argv['sweep']) {
        const priceChanges = [10, 15, 20, 25, 30];
        const volumeMults = [1.5, 2, 2.5, 3];
        const lookbacks = [15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000];
        const results = [];
        logger.info('Running parameter sweep...');
        const ohlcv = await loadOHLCV(ohlcvPath);
        for (const priceChangeThreshold of priceChanges) {
            for (const volumeMultiplier of volumeMults) {
                for (const lookbackPeriod of lookbacks) {
                    const trades = [];
                    let lastTrade = null;
                    for (let i = 1; i < ohlcv.length; i++) {
                        const prev = ohlcv[i - 1];
                        const curr = ohlcv[i];
                        if (curr &&
                            prev &&
                            typeof curr.close === 'number' &&
                            typeof prev.open === 'number' &&
                            typeof prev.volume === 'number' &&
                            typeof curr.volume === 'number') {
                            const priceDelta = ((curr.close - prev.open) / prev.open) * 100;
                            if (priceDelta > priceChangeThreshold &&
                                curr.volume > volumeMultiplier * prev.volume) {
                                if (!lastTrade || lastTrade.exitTime) {
                                    lastTrade = { entryTime: curr.timestamp, entryPrice: curr.close };
                                    trades.push(lastTrade);
                                }
                            }
                            // Simple exit: exit after 10 bars or at end
                            if (lastTrade &&
                                trades.length > 0 &&
                                typeof curr.timestamp === 'number' &&
                                typeof curr.close === 'number') {
                                const lastTradeObj = trades[trades.length - 1];
                                if (lastTradeObj &&
                                    typeof lastTradeObj.entryTime === 'number' &&
                                    i - lastTradeObj.entryTime >= 10) {
                                    lastTrade.exitTime = curr.timestamp;
                                    lastTrade.exitPrice = curr.close;
                                    lastTrade.pnl = (curr.close - lastTrade.entryPrice) / lastTrade.entryPrice;
                                    logger.info(`[Exit] Exit trade at ${curr.timestamp} price=${curr.close} PnL=${lastTrade.pnl}`);
                                    lastTrade = null;
                                }
                            }
                            // Handle negative priceDelta exit
                            if (lastTrade && !lastTrade.exitTime && priceDelta < -priceChangeThreshold) {
                                lastTrade.exitTime = curr.timestamp;
                                lastTrade.exitPrice = curr.close;
                                lastTrade.pnl =
                                    ((lastTrade.exitPrice - lastTrade.entryPrice) / lastTrade.entryPrice) * 100;
                            }
                        }
                    }
                    const pnls = trades.filter((t) => t.pnl !== undefined).map((t) => t.pnl);
                    const mean = pnls.reduce((a, b) => a + b, 0) / (pnls.length || 1);
                    const stdev = Math.sqrt(pnls.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (pnls.length || 1));
                    const sharpe = stdev > 0 ? mean / stdev : 0;
                    results.push({
                        priceChangeThreshold,
                        volumeMultiplier,
                        lookbackPeriod,
                        mean,
                        stdev,
                        sharpe,
                        trades: pnls.length,
                    });
                }
            }
        }
        // No need to handle final trade exits in sweep mode for now
        const topConfigs = results.sort((a, b) => b.sharpe - a.sharpe).slice(0, 3);
        fs.writeFileSync('sweep-report.json', JSON.stringify(topConfigs, null, 2));
        const configDir = path.resolve(__dirname, '../config');
        if (!fs.existsSync(configDir))
            fs.mkdirSync(configDir);
        fs.writeFileSync(path.join(configDir, 'auto-params.json'), JSON.stringify(topConfigs, null, 2));
        logger.info('Sweep complete. Top 3 configs:', topConfigs);
        return;
    }
    const priceChangeThreshold = argv['price-change'] ? Number(argv['price-change']) : 20;
    const volumeMultiplier = argv['volume-mult'] ? Number(argv['volume-mult']) : 2;
    const lookbackPeriod = argv['lookback'] ? Number(argv['lookback']) : 30 * 60 * 1000;
    logger.info(`Loading OHLCV data from ${ohlcvPath}`);
    const ohlcv = await loadOHLCV(ohlcvPath);
    logger.info(`Loaded ${ohlcv.length} rows of OHLCV data`);
    // TODO: Implement whaleSignalTriggers
    // logger.info(`Whale signals: ${whaleSignalTriggers.count()}`);
    // TODO: Implement forcedPumpExecuted
    // logger.info(`Forced pumps: ${forcedPumpExecuted.count()}`);
    const trades = [];
    let lastTrade = null;
    // Simple replay loop
    for (let i = 1; i < ohlcv.length; i++) {
        const prev = ohlcv[i - 1];
        const curr = ohlcv[i];
        // Volatility Squeeze: price jump and volume surge
        if (curr &&
            prev &&
            typeof curr.close === 'number' &&
            typeof prev.close === 'number' &&
            typeof curr.volume === 'number' &&
            typeof prev.volume === 'number') {
            const priceChange = ((curr.close - prev.close) / prev.close) * 100;
            const volumeChange = curr.volume / prev.volume;
            if (priceChange > 5 && volumeChange > 2) {
                lastTrade = { entryTime: curr.timestamp, entryPrice: curr.close };
                trades.push(lastTrade);
                logger.info(`[PatternMatch] Enter trade at ${curr.timestamp} price=${curr.close}`);
            }
        }
        // Simple exit: exit after 10 bars or at end
        if (lastTrade &&
            trades.length > 0 &&
            curr &&
            typeof curr.timestamp === 'number' &&
            typeof curr.close === 'number') {
            const lastTradeObj = trades[trades.length - 1];
            if (lastTradeObj &&
                typeof lastTradeObj.entryTime === 'number' &&
                i - lastTradeObj.entryTime >= 10) {
                lastTrade.exitTime = curr.timestamp;
                lastTrade.exitPrice = curr.close;
                lastTrade.pnl = (curr.close - lastTrade.entryPrice) / lastTrade.entryPrice;
                logger.info(`[Exit] Exit trade at ${curr.timestamp} price=${curr.close} PnL=${lastTrade.pnl}`);
                lastTrade = null;
            }
        }
    }
    // Final stats
    const totalPnl = trades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const wins = trades.filter((t) => (t.pnl || 0) > 0).length;
    const losses = trades.filter((t) => (t.pnl || 0) < 0).length;
    const avgPnl = trades.length ? totalPnl / trades.length : 0;
    logger.info(`[BacktestSummary] {"totalPnl":${totalPnl},"wins":${wins},"losses":${losses},"avgPnl":${avgPnl}}`);
}
main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
//# sourceMappingURL=backtest-vol-sim.js.map