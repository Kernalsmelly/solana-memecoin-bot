import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { parse } from 'csv-parse/sync';

const LOG_PATH = path.join(__dirname, '../data/trade_log.csv');

// Sweep params
const SL_PCTS = [1, 2, 3, 4, 5];
const TP_PCTS = [1, 2, 3, 4, 5];

interface Trade {
  action: string;
  price: number;
  amount: number;
  pnl: number;
  reason: string;
  success: string;
}

function loadTrades(): Trade[] {
  const csv = fs.readFileSync(LOG_PATH, 'utf8');
  const records = parse(csv, { columns: true, relax_column_count: true });
  // Only completed trades (BUY+SELL pairs)
  return records
    .filter((r: any) => r.action === 'SELL')
    .map((r: any) => ({
      action: r.action,
      price: parseFloat(r.price),
      amount: parseFloat(r.amount),
      pnl: parseFloat(r.pnl),
      reason: r.reason,
      success: r.success,
    }));
}

function simulate(trades: Trade[], sl: number, tp: number) {
  let netPnL = 0;
  let wins = 0;
  let count = 0;
  for (const t of trades) {
    // Simulate: If reason is stop_loss, only count if pnl <= -sl%; if take_profit, only if pnl >= tp%
    const entry = t.pnl === 0 ? 0 : t.pnl; // Defensive
    if (t.reason === 'stop_loss' && t.pnl <= -sl) {
      netPnL += t.pnl;
      count++;
      if (t.pnl > 0) wins++;
    } else if (t.reason === 'take_profit' && t.pnl >= tp) {
      netPnL += t.pnl;
      count++;
      if (t.pnl > 0) wins++;
    } else if (t.reason !== 'stop_loss' && t.reason !== 'take_profit') {
      // For other exit reasons (e.g., manual), include as-is
      netPnL += t.pnl;
      count++;
      if (t.pnl > 0) wins++;
    }
  }
  return { netPnL, winRate: count ? wins / count : 0, count };
}

function main() {
  const trades = loadTrades().slice(-100);
  let best = { sl: 0, tp: 0, netPnL: -Infinity, winRate: 0 };
  for (const sl of SL_PCTS) {
    for (const tp of TP_PCTS) {
      const { netPnL, winRate, count } = simulate(trades, sl, tp);
      console.log(
        `SL: ${sl}% TP: ${tp}% | NetPnL: ${netPnL.toFixed(4)} | WinRate: ${(winRate * 100).toFixed(2)}% | Trades: ${count}`,
      );
      if (netPnL > best.netPnL || (netPnL === best.netPnL && winRate > best.winRate)) {
        best = { sl, tp, netPnL, winRate };
      }
    }
  }
  console.log('\nBest SL/TP:', best);
}

main();
