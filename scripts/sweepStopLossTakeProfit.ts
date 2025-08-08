import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ANALYSIS_PATH = path.join(__dirname, '../data/analysis_report.json');
const SWEEP_RESULTS_PATH = path.join(__dirname, '../data/parameter_sweep_results.json');
const STOP_LOSS_PCTS = [0.01, 0.02, 0.03, 0.04, 0.05]; // 1-5%
const TAKE_PROFIT_PCTS = [0.01, 0.02, 0.03, 0.04, 0.05];

function loadTrades(): any[] {
  const data = fs.readFileSync(ANALYSIS_PATH, 'utf8');
  // Assume each entry is a summary for a token with trades array or summary fields
  const arr = JSON.parse(data);
  let trades: any[] = [];
  for (const token of arr) {
    if (Array.isArray(token.trades)) {
      trades = trades.concat(token.trades);
    }
  }
  // If no per-trade array, just use summary objects for sweep
  if (trades.length === 0) trades = arr;
  // Use only last 50
  return trades.slice(-50);
}

function simulateSweep(trades: any[]) {
  let bestParams = { stopLoss: 0, takeProfit: 0 };
  let bestStats = { netPnl: -Infinity, winRate: 0, wins: 0, losses: 0 };
  for (const sl of STOP_LOSS_PCTS) {
    for (const tp of TAKE_PROFIT_PCTS) {
      let netPnl = 0,
        wins = 0,
        losses = 0;
      for (const trade of trades) {
        // Simulate: If trade PnL >= tp, count as win; if <= -sl, count as loss; else ignore
        const pnl = trade.avgTradePnL ?? trade.pnl ?? 0;
        if (pnl >= tp) {
          netPnl += pnl;
          wins++;
        } else if (pnl <= -sl) {
          netPnl += pnl;
          losses++;
        } else {
          netPnl += pnl;
        }
      }
      const winRate = trades.length ? wins / trades.length : 0;
      if (
        netPnl > bestStats.netPnl ||
        (netPnl === bestStats.netPnl && winRate > bestStats.winRate)
      ) {
        bestParams = { stopLoss: sl, takeProfit: tp };
        bestStats = { netPnl, winRate, wins, losses };
      }
    }
  }
  return { bestParams, bestStats };
}

function main() {
  const trades = loadTrades();
  const sweep = simulateSweep(trades);
  fs.writeFileSync(SWEEP_RESULTS_PATH, JSON.stringify(sweep, null, 2));
  console.log('Sweep complete:', sweep);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
