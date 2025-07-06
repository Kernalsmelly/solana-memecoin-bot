import fs from 'fs';
import path from 'path';

/**
 * Trade log entry structure (expected for JSONL or CSV logs)
 */
interface TradeLogEntry {
  token: string; // mint or symbol
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  size: number;
  entryTime: string; // ISO or timestamp
  exitTime: string; // ISO or timestamp
  pnl: number;
  params?: Record<string, any>; // e.g. priceDelta, volMult
}

interface TokenStats {
  token: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  maxDrawdown: number;
  avgTradePnL: number;
  paramSummary: Record<string, any>;
}

function parseCSV(filePath: string): any[] {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  // Use the correct CSV header for trade log
  // timestamp,action,token,pairAddress,price,amount,pnl,reason,txid,success
  const [header, ...rows] = lines;
  if (!header) return [];
  const keys = header.split(',');
  return rows.map(row => {
    const values = row.split(',');
    const entry: Record<string, any> = {};
    keys.forEach((key, i) => {
      let val = values[i];
      if (key === 'pnl' || key === 'price' || key === 'amount') {
        const f = parseFloat(val || '0');
        if (isNaN(f)) {
          console.warn(`[analyze_trades] NaN for ${key} in row:`, row);
          entry[key] = 0;
        } else {
          entry[key] = f;
        }
      } else {
        entry[key] = val;
      }
    });
    // Map 'token' to ensure grouping works
    entry.token = entry.token || 'UNKNOWN';
    return entry;
  });
}

function analyzeTrades(trades: TradeLogEntry[]): TokenStats[] {
  const statsByToken: Record<string, TokenStats> = {};

  for (const trade of trades) {
    if (!statsByToken[trade.token]) {
      statsByToken[trade.token] = {
        token: trade.token,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnL: 0,
        maxDrawdown: 0,
        avgTradePnL: 0,
        paramSummary: {},
      };
    }
    const s = statsByToken[trade.token]!;
    s.trades++;
    s.totalPnL += trade.pnl;
    if (trade.pnl > 0) s.wins++; else s.losses++;
    // Drawdown calc (simplified)
    if (s.totalPnL < s.maxDrawdown) s.maxDrawdown = s.totalPnL;
    // Parameter summary (collect values)
    if (trade.params) {
      for (const [k, v] of Object.entries(trade.params)) {
        if (!s.paramSummary[k]) s.paramSummary[k] = [];
        s.paramSummary[k].push(v);
      }
    }
  }
  // Finalize stats
  for (const s of Object.values(statsByToken)) {
    s.winRate = s.trades ? s.wins / s.trades : 0;
    s.avgTradePnL = s.trades ? s.totalPnL / s.trades : 0;
    // Summarize params as mean
    for (const [k, arr] of Object.entries(s.paramSummary)) {
      if (Array.isArray(arr)) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        s.paramSummary[k] = mean;
      }
    }
  }
  return Object.values(statsByToken);
}

function generateMarkdownReport(stats: TokenStats[]): string {
  const sorted = stats.slice().sort((a, b) => b.totalPnL - a.totalPnL);
  let md = `# Trade Performance Report\n\n`;
  md += `| Token | Trades | Win Rate | Total PnL | Max Drawdown | Avg Trade PnL |\n`;
  md += `|-------|--------|----------|-----------|--------------|---------------|\n`;
  for (const s of sorted) {
    md += `| ${s.token} | ${s.trades} | ${(s.winRate*100).toFixed(1)}% | ${s.totalPnL.toFixed(2)} | ${s.maxDrawdown.toFixed(2)} | ${s.avgTradePnL.toFixed(2)} |\n`;
  }
  md += `\n## Parameter Sensitivities (mean values)\n`;
  for (const s of sorted) {
    md += `- **${s.token}**: ${JSON.stringify(s.paramSummary)}\n`;
  }
  return md;
}

// Entry point
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: ts-node analyze_trades.ts <trade_log.jsonl>');
    process.exit(1);
  }
  const trades = parseCSV(filePath);
  const stats = analyzeTrades(trades);
  const md = generateMarkdownReport(stats);
  fs.writeFileSync(path.join(path.dirname(filePath), 'analysis_report.md'), md);
  fs.writeFileSync(path.join(path.dirname(filePath), 'analysis_report.json'), JSON.stringify(stats, null, 2));
  console.log('Analysis complete. Reports written to analysis_report.md and analysis_report.json');
}
