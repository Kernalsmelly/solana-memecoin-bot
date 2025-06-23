import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const OPPS_FILE = path.join(DATA_DIR, 'scoredOpportunities.jsonl');
const TRADES_FILE = path.join(DATA_DIR, 'trades.jsonl');

interface Opportunity {
  source: string;
  address: string;
  symbol: string;
  score: number;
  reasons: string[];
  metrics: any;
  timestamp: number;
}

interface Trade {
  type: 'open' | 'close';
  id?: string;
  tokenAddress: string;
  tokenSymbol?: string;
  score?: number;
  pnl?: number;
  timestamp: number;
  [key: string]: any;
}

function readJsonl(file: string) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function main() {
  const opportunities: Opportunity[] = readJsonl(OPPS_FILE);
  const trades: Trade[] = readJsonl(TRADES_FILE);
  if (!opportunities.length || !trades.length) {
    console.log('No data to analyze.');
    return;
  }

  // Score distribution
  const scoreBands = [50, 60, 70, 80, 90, 100];
  const bandStats: Record<string, { count: number; wins: number; losses: number; avgPnl: number; pnls: number[]; } > = {};
  for (const band of scoreBands) {
    bandStats[`${band}+`] = { count: 0, wins: 0, losses: 0, avgPnl: 0, pnls: [] };
  }

  // Map tokenAddress to opportunity score
  const scoreMap: Record<string, { score: number; reasons: string[]; source: string }> = {};
  for (const opp of opportunities) {
    scoreMap[opp.address] = { score: opp.score, reasons: opp.reasons, source: opp.source };
  }

  // Analyze trades (only 'close' events with PnL)
  const closedTrades = trades.filter(t => t.type === 'close' && typeof t.pnl === 'number');
  for (const trade of closedTrades) {
    const { score, reasons, source } = scoreMap[trade.tokenAddress] || {};
    if (typeof score !== 'number') continue;
    const band = scoreBands.slice().reverse().find(b => score >= b) || 50;
    const bandKey = `${band}+`;
    const stats = bandStats[bandKey]!;
stats.count++;
stats.pnls.push(trade.pnl!);
if (trade.pnl! > 0) stats.wins++;
else stats.losses++;
  }
  for (const bandKey in bandStats) {
    const stats = bandStats[bandKey]!;
    if (stats.pnls.length) {
      stats.avgPnl = stats.pnls.reduce((a,b) => a+b, 0) / stats.pnls.length;
    }
  }

  // Top sources by win rate
  const sourceStats: Record<string, { count: number; wins: number; losses: number; avgPnl: number; pnls: number[] }> = {};
  for (const trade of closedTrades) {
    const { source } = scoreMap[trade.tokenAddress] || {};
    if (!source) continue;
    if (!sourceStats[source]) sourceStats[source] = { count: 0, wins: 0, losses: 0, avgPnl: 0, pnls: [] };
    const sStats = sourceStats[source]!;
sStats.count++;
sStats.pnls.push(trade.pnl!);
if (trade.pnl! > 0) sStats.wins++;
else sStats.losses++;
  }
  for (const source in sourceStats) {
    const stats = sourceStats[source]!;
    if (stats.pnls.length) {
      stats.avgPnl = stats.pnls.reduce((a,b) => a+b, 0) / stats.pnls.length;
    }
  }

  // Most common reasons among winners/losers
  const winnerReasons: Record<string, number> = {};
  const loserReasons: Record<string, number> = {};
  for (const trade of closedTrades) {
    const { score, reasons } = scoreMap[trade.tokenAddress] || {};
    if (!reasons) continue;
    if (trade.pnl! > 0) {
      for (const r of reasons) winnerReasons[r] = (winnerReasons[r] || 0) + 1;
    } else {
      for (const r of reasons) loserReasons[r] = (loserReasons[r] || 0) + 1;
    }
  }

  // Print summary
  console.log('--- Opportunity Score Band Stats (closed trades) ---');
  for (const bandKey of Object.keys(bandStats)) {
    const s = bandStats[bandKey];
    if (s) {
      console.log(`${bandKey}: Trades=${s.count}, Win%=${s.count?s.wins/s.count*100:0}% AvgPnL=${s.avgPnl.toFixed(2)}%`);
    }
  }
  console.log('\n--- Source Stats ---');
  for (const source of Object.keys(sourceStats)) {
    const s = sourceStats[source];
    if (s) {
      console.log(`${source}: Trades=${s.count}, Win%=${s.count?s.wins/s.count*100:0}% AvgPnL=${s.avgPnl.toFixed(2)}%`);
    }
  }
  const topWinnerReasons = Object.entries(winnerReasons).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topLoserReasons = Object.entries(loserReasons).sort((a,b)=>b[1]-a[1]).slice(0,5);
  console.log('\n--- Top Winner Reasons ---');
  for (const [reason, count] of topWinnerReasons) {
    console.log(`${reason}: ${count}`);
  }
  console.log('\n--- Top Loser Reasons ---');
  for (const [reason, count] of topLoserReasons) {
    console.log(`${reason}: ${count}`);
  }
}

main();
