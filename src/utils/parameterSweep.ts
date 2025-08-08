import fs from 'fs';
import path from 'path';
import readline from 'readline';

// Helper to parse CSV line
function parseTradeLine(line: string) {
  // timestamp,action,token,pairAddress,price,amount,pnl,reason,,success
  const [timestamp, action, token, pairAddress, price, amount, pnl, reason, , success] =
    line.split(',');
  return {
    timestamp,
    action,
    token,
    pairAddress,
    price: parseFloat(price ?? '0'),
    amount: parseFloat(amount ?? '0'),
    pnl: parseFloat(pnl ?? '0'),
    reason,
    success: success === 'true',
  };
}

// Read all trades from CSV
async function readTrades(csvPath: string) {
  const trades: any[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    } // skip header
    if (line.trim() === '') continue;
    trades.push(parseTradeLine(line));
  }
  return trades;
}

// Group buy/sell trades into pairs
function pairTrades(trades: any[]) {
  const pairs = [];
  let currentBuy = null;
  for (const trade of trades) {
    if (trade.action === 'BUY') {
      currentBuy = trade;
    } else if (
      trade.action === 'SELL' &&
      currentBuy &&
      trade.pairAddress === currentBuy.pairAddress
    ) {
      pairs.push({ buy: currentBuy, sell: trade });
      currentBuy = null;
    }
  }
  return pairs;
}

// Run sweep
async function runSweep() {
  const csvPath = path.join(__dirname, '../../data/trade_log.csv');
  const trades = await readTrades(csvPath);
  const pairs = pairTrades(trades);

  let bestParams = { stopLoss: 0, takeProfit: 0 };
  let bestNetPnl = -Infinity;
  let bestWinRate = 0;
  let bestStats = {};

  // Sweep STOP_LOSS_PCT from 1% to 5% and TAKE_PROFIT_PCT from 1% to 10% in 0.5% increments
  for (let stopLoss = 0.01; stopLoss <= 0.05; stopLoss += 0.005) {
    for (let takeProfit = 0.01; takeProfit <= 0.1; takeProfit += 0.005) {
      let netPnl = 0;
      let wins = 0;
      let losses = 0;
      for (const { buy, sell } of pairs) {
        const entry = buy.price;
        const exit = sell.price;
        const pctChange = (exit - entry) / entry;
        let triggered = '';
        if (pctChange <= -stopLoss) {
          triggered = 'stopLoss';
        } else if (pctChange >= takeProfit) {
          triggered = 'takeProfit';
        } else {
          triggered = 'none';
        }
        const pnl = (exit - entry) * buy.amount;
        netPnl += pnl;
        if (pnl > 0) wins++;
        else losses++;
      }
      const winRate = wins / (wins + losses);
      if (netPnl > bestNetPnl || (netPnl === bestNetPnl && winRate > bestWinRate)) {
        bestNetPnl = netPnl;
        bestWinRate = winRate;
        bestParams = {
          stopLoss: parseFloat(stopLoss.toFixed(3)),
          takeProfit: parseFloat(takeProfit.toFixed(3)),
        };
        bestStats = { netPnl, winRate, wins, losses };
      }
    }
  }

  // Output results
  const outPath = path.join(__dirname, '../../data/parameter_sweep_results.json');
  fs.writeFileSync(outPath, JSON.stringify({ bestParams, bestStats }, null, 2));
  console.log('Best Params:', bestParams, 'Stats:', bestStats);

  // Update config
  const configPath = path.join(__dirname, 'config.ts');
  let configContent = fs.readFileSync(configPath, 'utf-8');
  configContent = configContent.replace(
    /stopLossPercent: getEnvAsNumber\('STOP_LOSS_PERCENT'\)[^,]*/,
    `stopLossPercent: ${bestParams.stopLoss}`,
  );
  configContent = configContent.replace(
    /takeProfitPercent: getEnvAsNumber\('TAKE_PROFIT_PERCENT'\)[^,]*/,
    `takeProfitPercent: ${bestParams.takeProfit}`,
  );
  fs.writeFileSync(configPath, configContent);
}

if (require.main === module) {
  runSweep();
}

export { runSweep };
