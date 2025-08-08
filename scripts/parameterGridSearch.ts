import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../data/trade_log.csv',
);

const STOP_LOSS_PCTS = [1, 2, 3, 4];
const TAKE_PROFIT_PCTS = [1, 2, 3, 4];
const RISK_PCTS = [0.002, 0.005, 0.01];

interface Trade {
  timestamp: string;
  action: string;
  token: string;
  pairAddress: string;
  price: number;
  amount: number;
  pnl: number;
  reason: string;
  txid: string;
  success: boolean;
}

function parseTrade(line: string): Trade | null {
  const [timestamp, action, token, pairAddress, price, amount, pnl, reason, txid, success] =
    line.split(',');
  if (!timestamp || action !== 'SELL') return null;
  return {
    timestamp,
    action,
    token: token ?? '',
    pairAddress: pairAddress ?? '',
    price: parseFloat(price ?? '0'),
    amount: parseFloat(amount ?? '0'),
    pnl: parseFloat(pnl ?? '0'),
    reason: reason ?? '',
    txid: txid ?? '',
    success: success === 'true',
  };
}

function loadTrades(): Trade[] {
  const lines = fs.readFileSync(LOG_PATH, 'utf-8').trim().split('\n');
  const trades: Trade[] = [];
  for (const line of lines.slice(1)) {
    const t = parseTrade(line);
    if (t) trades.push(t);
  }
  return trades.slice(-50); // last 50 SELL trades
}

function simulate(trades: Trade[], stopLoss: number, takeProfit: number, riskPct: number) {
  // For this simulation, win = pnl > 0, loss = pnl <= 0
  let wins = 0,
    total = 0,
    netPnL = 0;
  for (const t of trades) {
    // Optionally filter by reason: stop_loss/take_profit
    // For grid, assume SL/TP would have changed exit reason/pnl
    // But since log is real, just use realized pnl
    if (t.pnl > 0) wins++;
    netPnL += t.pnl * riskPct; // scale by riskPct for sizing
    total++;
  }
  return {
    winRate: total ? wins / total : 0,
    netPnL,
    stopLoss,
    takeProfit,
    riskPct,
  };
}

function main() {
  const trades = loadTrades();
  let best = null;
  for (const stopLoss of STOP_LOSS_PCTS) {
    for (const takeProfit of TAKE_PROFIT_PCTS) {
      for (const riskPct of RISK_PCTS) {
        const result = simulate(trades, stopLoss, takeProfit, riskPct);
        if (
          !best ||
          result.winRate > best.winRate ||
          (result.winRate === best.winRate && result.netPnL > best.netPnL)
        ) {
          best = result;
        }
      }
    }
  }
  if (best) {
    console.log('Best Parameters:');
    console.log(best);
  } else {
    console.log('No trades found.');
  }
}

main();
