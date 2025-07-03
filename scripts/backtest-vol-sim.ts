import fs from 'fs';
import path from 'path';
import { parse as csvParse } from 'csv-parse';
import minimist from 'minimist';
import { VolatilitySqueeze } from '../src/strategies/volatilitySqueeze';
import logger from '../src/utils/logger';

interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  pnl?: number;
}

async function loadOHLCV(csvPath: string): Promise<OHLCV[]> {
  const content = fs.readFileSync(csvPath, 'utf8');
  return new Promise((resolve, reject) => {
    csvParse(content, { columns: true, skip_empty_lines: true }, (err, records) => {
      if (err) return reject(err);
      console.log('[DEBUG] Parsed records:', records.length, records[0]);
      resolve(records.map((r: any) => ({
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


async function main() {
  const argv = minimist(process.argv.slice(2));
  const ohlcvPath = argv['csv'] || 'data/ohlcv.csv';
  const priceChangeThreshold = argv['price-change'] ? Number(argv['price-change']) : 20;
  const volumeMultiplier = argv['volume-mult'] ? Number(argv['volume-mult']) : 2;
  const lookbackPeriod = argv['lookback'] ? Number(argv['lookback']) : 30 * 60 * 1000;

  logger.info(`Loading OHLCV data from ${ohlcvPath}`);
  const ohlcv = await loadOHLCV(ohlcvPath);
  logger.info(`Loaded ${ohlcv.length} rows of OHLCV data`);

  const trades: Trade[] = [];
  let lastTrade: Trade | null = null;

  // Simple replay loop
  for (let i = 1; i < ohlcv.length; i++) {
    const prev = ohlcv[i - 1];
    const curr = ohlcv[i];
    // Volatility Squeeze: price jump and volume surge
    const priceChange = ((curr.close - prev.close) / prev.close) * 100;
    const volumeChange = curr.volume / prev.volume;
    if (priceChange >= priceChangeThreshold && volumeChange >= volumeMultiplier) {
      // Enter trade
      lastTrade = { entryTime: curr.timestamp, entryPrice: curr.close };
      trades.push(lastTrade);
      logger.info(`[PatternMatch] Enter trade at ${curr.timestamp} price=${curr.close}`);
    }
    // Simple exit: exit after 10 bars or at end
    if (lastTrade && trades.length > 0 && (i - trades[trades.length - 1].entryTime) >= 10) {
      lastTrade.exitTime = curr.timestamp;
      lastTrade.exitPrice = curr.close;
      lastTrade.pnl = (curr.close - lastTrade.entryPrice) / lastTrade.entryPrice;
      logger.info(`[Exit] Exit trade at ${curr.timestamp} price=${curr.close} PnL=${lastTrade.pnl}`);
      lastTrade = null;
    }
  }

  // Final stats
  const totalPnl = trades.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const wins = trades.filter(t => (t.pnl || 0) > 0).length;
  const losses = trades.filter(t => (t.pnl || 0) < 0).length;
  const avgPnl = trades.length ? totalPnl / trades.length : 0;
  logger.info(`[BacktestSummary] {"totalPnl":${totalPnl},"wins":${wins},"losses":${losses},"avgPnl":${avgPnl}}`);
}

main().catch(e => {
  logger.error(e);
  process.exit(1);
});
