#!/usr/bin/env ts-node
"use strict";
/**
 * Daily Performance Report Generator
 *
 * This script generates detailed performance reports for the trading bot,
 * including metrics, charts, and trade analysis. It can be run manually
 * or scheduled to run daily.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
const logger_1 = __importDefault(require("../utils/logger"));
const notifications_1 = require("../utils/notifications");
// Load environment variables
dotenv.config();
// Constants
const DATA_DIR = process.env.DATA_DIRECTORY || './data';
const STATE_FILE = path.join(DATA_DIR, 'bot_state.json');
const HISTORY_FILE = path.join(DATA_DIR, 'trade_history.json');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}
/**
 * Load the trading history from file
 */
function loadTradingHistory() {
    if (!fs.existsSync(HISTORY_FILE)) {
        return [];
    }
    try {
        const historyData = fs.readFileSync(HISTORY_FILE, 'utf8');
        return JSON.parse(historyData);
    }
    catch (err) {
        logger_1.default.error(`Failed to load trading history: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}
/**
 * Load the current bot state
 */
function loadBotState() {
    if (!fs.existsSync(STATE_FILE)) {
        return null;
    }
    try {
        const stateData = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(stateData);
    }
    catch (err) {
        logger_1.default.error(`Failed to load bot state: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
/**
 * Calculate daily performance metrics
 */
function calculateDailyPerformance(allTrades, date) {
    // Filter trades for the given date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const trades = allTrades.filter(trade => {
        const exitTime = new Date(trade.exitTime);
        return exitTime >= startOfDay && exitTime <= endOfDay;
    });
    // If no trades, return empty performance
    if (trades.length === 0) {
        return {
            date,
            startingBalance: 0,
            endingBalance: 0,
            netProfit: 0,
            netProfitPercent: 0,
            trades: [],
            winningTrades: 0,
            losingTrades: 0,
            winRate: 0,
            averageProfitPercent: 0,
            averageLossPercent: 0,
            profitFactor: 0,
            biggestWin: 0,
            biggestLoss: 0,
            averageHoldingTimeMinutes: 0,
            maxDrawdown: 0,
            patternPerformance: {},
            maxConsecutiveWins: 0,
            maxConsecutiveLosses: 0
        };
    }
    // Basic metrics
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const totalProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const netProfit = totalProfit - totalLoss;
    // Assuming the balance at the end of previous day is starting balance
    const botState = loadBotState();
    let startingBalance = botState?.dailyStartBalance || 0;
    // If we don't have dailyStartBalance, estimate it
    if (startingBalance === 0 && botState?.currentBalance) {
        startingBalance = botState.currentBalance - netProfit;
    }
    const endingBalance = startingBalance + netProfit;
    const netProfitPercent = startingBalance > 0 ? (netProfit / startingBalance) * 100 : 0;
    // Advanced metrics
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
    const averageProfitPercent = winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length
        : 0;
    const averageLossPercent = losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnlPercent), 0) / losingTrades.length
        : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 999 : 0;
    const biggestWin = winningTrades.length > 0
        ? Math.max(...winningTrades.map(t => t.pnl))
        : 0;
    const biggestLoss = losingTrades.length > 0
        ? Math.min(...losingTrades.map(t => t.pnl))
        : 0;
    const averageHoldingTimeMinutes = trades.length > 0
        ? trades.reduce((sum, t) => sum + t.holdingTimeMinutes, 0) / trades.length
        : 0;
    const maxDrawdown = trades.length > 0
        ? Math.max(...trades.map(t => t.maxDrawdown || 0))
        : 0;
    // Pattern performance
    const patternPerformance = {};
    // Group trades by pattern type
    const tradesByPattern = {};
    trades.forEach(trade => {
        const pattern = trade.patternType || 'Unknown';
        if (!tradesByPattern[pattern]) {
            tradesByPattern[pattern] = [];
        }
        tradesByPattern[pattern].push(trade);
    });
    // Calculate pattern-specific metrics
    Object.entries(tradesByPattern).forEach(([pattern, patternTrades]) => {
        const winningPatternTrades = patternTrades.filter(t => t.pnl > 0);
        const totalPatternProfit = patternTrades.reduce((sum, t) => sum + t.pnl, 0);
        patternPerformance[pattern] = {
            trades: patternTrades.length,
            winRate: patternTrades.length > 0 ? (winningPatternTrades.length / patternTrades.length) * 100 : 0,
            avgProfit: patternTrades.length > 0 ? totalPatternProfit / patternTrades.length : 0,
            totalProfit: totalPatternProfit
        };
    });
    // Calculate consecutive win/loss streaks
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    // Sort trades by time
    const sortedTrades = [...trades].sort((a, b) => new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime());
    sortedTrades.forEach(trade => {
        if (trade.pnl > 0) {
            // Winning trade
            currentWinStreak++;
            currentLossStreak = 0;
            maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
        }
        else {
            // Losing trade
            currentLossStreak++;
            currentWinStreak = 0;
            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
        }
    });
    return {
        date,
        startingBalance,
        endingBalance,
        netProfit,
        netProfitPercent,
        trades,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate,
        averageProfitPercent,
        averageLossPercent,
        profitFactor,
        biggestWin,
        biggestLoss,
        averageHoldingTimeMinutes,
        maxDrawdown,
        patternPerformance,
        maxConsecutiveWins,
        maxConsecutiveLosses
    };
}
/**
 * Generate HTML report
 */
function generateHtmlReport(performance) {
    // Prepare data for charts
    const patternNames = Object.keys(performance.patternPerformance);
    const patternWinRates = patternNames.map(p => performance.patternPerformance[p].winRate);
    const patternAvgProfits = patternNames.map(p => performance.patternPerformance[p].avgProfit);
    const patternTradeCounts = patternNames.map(p => performance.patternPerformance[p].trades);
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trading Bot Daily Report: ${performance.date}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f7f9fc;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid #ddd;
    }
    .summary-box {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 30px;
    }
    .metric-card {
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      flex: 1 1 200px;
    }
    .metric-value {
      font-size: 1.8em;
      font-weight: bold;
      color: #2980b9;
    }
    .profit { color: #27ae60; }
    .loss { color: #e74c3c; }
    .chart-container {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
      background: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #34495e;
      color: white;
    }
    tr:nth-child(even) {
      background-color: #f8f9fa;
    }
    tr:hover {
      background-color: #f1f4f7;
    }
    .pattern-card {
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 15px;
    }
    .pattern-header {
      font-weight: bold;
      color: #34495e;
      font-size: 1.2em;
      margin-bottom: 10px;
    }
    .pattern-stats {
      display: flex;
      justify-content: space-between;
    }
    .pattern-stat {
      text-align: center;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      color: #7f8c8d;
      font-size: 0.9em;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <div class="header">
    <h1>SolMemeBot Trading Report</h1>
    <h2>${performance.date}</h2>
  </div>
  
  <div class="summary-box">
    <div class="metric-card">
      <div>Net Profit</div>
      <div class="metric-value ${performance.netProfit >= 0 ? 'profit' : 'loss'}">
        $${performance.netProfit.toFixed(2)} (${performance.netProfitPercent.toFixed(2)}%)
      </div>
    </div>
    <div class="metric-card">
      <div>Trade Count</div>
      <div class="metric-value">${performance.trades.length}</div>
    </div>
    <div class="metric-card">
      <div>Win Rate</div>
      <div class="metric-value">${performance.winRate.toFixed(2)}%</div>
    </div>
    <div class="metric-card">
      <div>Profit Factor</div>
      <div class="metric-value">${performance.profitFactor.toFixed(2)}</div>
    </div>
  </div>
  
  <div class="chart-container">
    <h3>Pattern Performance</h3>
    <canvas id="patternChart"></canvas>
  </div>
  
  <h3>Pattern Breakdown</h3>
  <div class="summary-box">
    ${patternNames.map(pattern => `
      <div class="pattern-card">
        <div class="pattern-header">${pattern}</div>
        <div class="pattern-stats">
          <div class="pattern-stat">
            <div>Trades</div>
            <div><strong>${performance.patternPerformance[pattern].trades}</strong></div>
          </div>
          <div class="pattern-stat">
            <div>Win Rate</div>
            <div><strong>${performance.patternPerformance[pattern].winRate.toFixed(2)}%</strong></div>
          </div>
          <div class="pattern-stat">
            <div>Avg. Profit</div>
            <div><strong>$${performance.patternPerformance[pattern].avgProfit.toFixed(2)}</strong></div>
          </div>
          <div class="pattern-stat">
            <div>Total Profit</div>
            <div><strong>$${performance.patternPerformance[pattern].totalProfit.toFixed(2)}</strong></div>
          </div>
        </div>
      </div>
    `).join('')}
  </div>
  
  <h3>Key Performance Metrics</h3>
  <table>
    <tr>
      <th>Metric</th>
      <th>Value</th>
    </tr>
    <tr>
      <td>Starting Balance</td>
      <td>$${performance.startingBalance.toFixed(2)}</td>
    </tr>
    <tr>
      <td>Ending Balance</td>
      <td>$${performance.endingBalance.toFixed(2)}</td>
    </tr>
    <tr>
      <td>Winning Trades</td>
      <td>${performance.winningTrades}</td>
    </tr>
    <tr>
      <td>Losing Trades</td>
      <td>${performance.losingTrades}</td>
    </tr>
    <tr>
      <td>Average Win %</td>
      <td>${performance.averageProfitPercent.toFixed(2)}%</td>
    </tr>
    <tr>
      <td>Average Loss %</td>
      <td>${performance.averageLossPercent.toFixed(2)}%</td>
    </tr>
    <tr>
      <td>Biggest Win</td>
      <td>$${performance.biggestWin.toFixed(2)}</td>
    </tr>
    <tr>
      <td>Biggest Loss</td>
      <td>$${performance.biggestLoss.toFixed(2)}</td>
    </tr>
    <tr>
      <td>Avg. Holding Time</td>
      <td>${performance.averageHoldingTimeMinutes.toFixed(2)} minutes</td>
    </tr>
    <tr>
      <td>Max Drawdown</td>
      <td>${performance.maxDrawdown.toFixed(2)}%</td>
    </tr>
    <tr>
      <td>Max Consecutive Wins</td>
      <td>${performance.maxConsecutiveWins}</td>
    </tr>
    <tr>
      <td>Max Consecutive Losses</td>
      <td>${performance.maxConsecutiveLosses}</td>
    </tr>
  </table>
  
  <h3>Trade Details</h3>
  <table>
    <tr>
      <th>Token</th>
      <th>Pattern</th>
      <th>Entry</th>
      <th>Exit</th>
      <th>Size</th>
      <th>Time (min)</th>
      <th>P&L</th>
      <th>P&L %</th>
    </tr>
    ${performance.trades.map(trade => `
      <tr>
        <td>${trade.tokenSymbol}</td>
        <td>${trade.patternType || 'Unknown'}</td>
        <td>$${trade.entryPrice.toFixed(6)}</td>
        <td>$${trade.exitPrice.toFixed(6)}</td>
        <td>${trade.positionSize.toFixed(2)}</td>
        <td>${trade.holdingTimeMinutes.toFixed(2)}</td>
        <td class="${trade.pnl >= 0 ? 'profit' : 'loss'}">$${trade.pnl.toFixed(2)}</td>
        <td class="${trade.pnlPercent >= 0 ? 'profit' : 'loss'}">${trade.pnlPercent.toFixed(2)}%</td>
      </tr>
    `).join('')}
  </table>
  
  <div class="footer">
    <p>Generated by SolMemeBot Trading System on ${new Date().toISOString()}</p>
    <p>© 2025 SolMemeBot</p>
  </div>
  
  <script>
    // Pattern performance chart
    const patternCtx = document.getElementById('patternChart').getContext('2d');
    new Chart(patternCtx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(patternNames)},
        datasets: [
          {
            label: 'Win Rate %',
            data: ${JSON.stringify(patternWinRates)},
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            yAxisID: 'y'
          },
          {
            label: 'Avg. Profit $',
            data: ${JSON.stringify(patternAvgProfits)},
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
            yAxisID: 'y1'
          },
          {
            label: 'Trade Count',
            data: ${JSON.stringify(patternTradeCounts)},
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
            position: 'left',
            title: {
              display: true,
              text: 'Win Rate %'
            }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            title: {
              display: true,
              text: 'Avg. Profit $'
            },
            grid: {
              drawOnChartArea: false
            }
          },
          y2: {
            beginAtZero: true,
            position: 'right',
            title: {
              display: true,
              text: 'Trade Count'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  </script>
</body>
</html>
  `;
    return html;
}
/**
 * Generate a simple text report (for email/notification)
 */
function generateTextReport(performance) {
    let report = `
==== SolMemeBot Trading Report: ${performance.date} ====

DAILY SUMMARY:
- Net Profit: $${performance.netProfit.toFixed(2)} (${performance.netProfitPercent.toFixed(2)}%)
- Trades: ${performance.trades.length} (${performance.winningTrades} wins, ${performance.losingTrades} losses)
- Win Rate: ${performance.winRate.toFixed(2)}%
- Profit Factor: ${performance.profitFactor.toFixed(2)}

TOP PATTERNS:
`;
    // Sort patterns by profit
    const sortedPatterns = Object.entries(performance.patternPerformance)
        .sort((a, b) => b[1].totalProfit - a[1].totalProfit);
    sortedPatterns.forEach(([pattern, stats]) => {
        report += `- ${pattern}: ${stats.trades} trades, ${stats.winRate.toFixed(2)}% win rate, $${stats.totalProfit.toFixed(2)} profit\n`;
    });
    report += `
KEY METRICS:
- Starting Balance: $${performance.startingBalance.toFixed(2)}
- Ending Balance: $${performance.endingBalance.toFixed(2)}
- Average Win: ${performance.averageProfitPercent.toFixed(2)}%
- Average Loss: ${performance.averageLossPercent.toFixed(2)}%
- Max Drawdown: ${performance.maxDrawdown.toFixed(2)}%
- Avg. Holding Time: ${performance.averageHoldingTimeMinutes.toFixed(2)} minutes

Generated on ${new Date().toISOString()}
`;
    return report;
}
/**
 * Main function
 */
async function main() {
    try {
        console.log('🔄 Generating daily performance report...');
        // Get yesterday's date (or use provided date argument)
        const targetDate = process.argv[2] ||
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        console.log(`📊 Target date: ${targetDate}`);
        // Load trading history
        const allTrades = loadTradingHistory();
        if (allTrades.length === 0) {
            console.log('❌ No trading history found');
            return;
        }
        // Calculate performance
        const performance = calculateDailyPerformance(allTrades, targetDate);
        if (performance.trades.length === 0) {
            console.log(`❌ No trades found for ${targetDate}`);
            return;
        }
        // Generate reports
        const htmlReport = generateHtmlReport(performance);
        const textReport = generateTextReport(performance);
        // Save reports
        const reportFilename = `report-${targetDate}.html`;
        const reportPath = path.join(REPORTS_DIR, reportFilename);
        fs.writeFileSync(reportPath, htmlReport);
        console.log(`✅ HTML report saved to: ${reportPath}`);
        const textReportFilename = `report-${targetDate}.txt`;
        const textReportPath = path.join(REPORTS_DIR, textReportFilename);
        fs.writeFileSync(textReportPath, textReport);
        console.log(`✅ Text report saved to: ${textReportPath}`);
        // Send notification with summary
        await (0, notifications_1.sendAlert)(`Daily Report (${targetDate}): ${performance.netProfitPercent.toFixed(2)}% P&L on ${performance.trades.length} trades`, 'INFO');
        console.log('🎉 Report generation complete!');
    }
    catch (err) {
        console.error('❌ Error generating report:', err);
    }
}
// Run main function
if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
