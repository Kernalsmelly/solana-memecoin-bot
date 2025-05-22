#!/usr/bin/env ts-node
/**
 * Performance Monitoring Dashboard
 * 
 * This script provides a real-time dashboard for monitoring the bot's performance
 * using terminal-based charts and statistics. It reads from the state file and
 * provides visual feedback on trading performance.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createServer } from 'http';
import * as readline from 'readline';

// Load environment variables
dotenv.config();

// Constants
const DATA_DIR = process.env.DATA_DIRECTORY || './data';
const STATE_FILE = path.join(DATA_DIR, 'bot_state.json');
const HISTORY_FILE = path.join(DATA_DIR, 'trade_history.json');
const REFRESH_INTERVAL_MS = 5000; // 5 seconds

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

// Performance metrics interface
interface PerformanceMetrics {
  startingBalance: number;
  currentBalance: number;
  highWaterMark: number;
  dailyStartBalance: number;
  activePositions: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  averagePnl: number;
  averageMaxDrawdown: number;
  systemEnabled: boolean;
  lastUpdated: string;
}

// Simple ASCII bar chart
function createBarChart(data: number[], labels: string[], title: string, maxWidth: number = 50): string {
  if (data.length === 0) return 'No data available';
  
  const maxValue = Math.max(...data);
  let chart = `${title}\n`;
  
  data.forEach((value, index) => {
    const barLength = Math.round((value / maxValue) * maxWidth);
    const bar = '█'.repeat(barLength);
    const label = labels[index] || '';
    const valueFormatted = value.toFixed(2);
    
    chart += `${label.padEnd(15)} │${value >= 0 ? colors.green : colors.red}${bar}${colors.reset} ${valueFormatted}\n`;
  });
  
  return chart;
}

// Create simple line chart for trends
function createLineChart(data: number[], title: string, width: number = 50, height: number = 10): string {
  if (data.length === 0) return 'No data available';
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  // Normalize and fit to height
  const normalizedData = data.map(val => Math.floor(((val - min) / range) * (height - 1)));
  
  let chart = `${title} (Min: ${min.toFixed(2)}, Max: ${max.toFixed(2)})\n`;
  
  for (let y = height - 1; y >= 0; y--) {
    const row = normalizedData.map(val => val === y ? '●' : (val > y ? '│' : ' '));
    const value = min + (range * (y / (height - 1)));
    chart += `${value.toFixed(1).padStart(6)} │ ${row.join('')}\n`;
  }
  
  // X-axis
  chart += '       └' + '─'.repeat(data.length * 2) + '\n';
  
  // X labels for first, middle and last
  const xLabels = ['Start', 'Mid', 'Now'];
  const xLabelPositions = [0, Math.floor(data.length / 2), data.length - 1];
  
  let xAxis = '        ';
  for (let i = 0; i < data.length; i++) {
    const labelIndex = xLabelPositions.indexOf(i);
    if (labelIndex >= 0) {
      const label = xLabels[labelIndex] as string;
      xAxis += label.padEnd(4);
    } else {
      xAxis += '  ';
    }
  }
  
  chart += xAxis;
  return chart;
}

// Load and parse performance data
function loadPerformanceData(): PerformanceMetrics | null {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return null;
    }
    
    const stateData = fs.readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(stateData);
    
    // Load trade history if available
    let trades: any[] = [];
    if (fs.existsSync(HISTORY_FILE)) {
      try {
        const historyData = fs.readFileSync(HISTORY_FILE, 'utf8');
        trades = JSON.parse(historyData);
      } catch (err) {
        console.error(`Error reading trade history: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    // Calculate metrics
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl < 0).length;
    
    const totalProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0)) || 1;
    
    const profitFactor = totalProfit / totalLoss;
    const averagePnl = trades.length > 0 ? trades.reduce((sum, t) => sum + t.pnl, 0) / trades.length : 0;
    const averageMaxDrawdown = trades.length > 0 ? trades.reduce((sum, t) => sum + (t.maxDrawdown || 0), 0) / trades.length : 0;
    
    return {
      startingBalance: state.initialBalance || 0,
      currentBalance: state.currentBalance || 0,
      highWaterMark: state.highWaterMark || 0,
      dailyStartBalance: state.dailyStartBalance || 0,
      activePositions: state.activePositions || 0,
      totalTrades: trades.length,
      winningTrades,
      losingTrades,
      profitFactor,
      averagePnl,
      averageMaxDrawdown,
      systemEnabled: state.systemEnabled !== false,
      lastUpdated: state.lastUpdated || new Date().toISOString()
    };
  } catch (err) {
    console.error(`Error loading performance data: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// Format percentage with color
function formatPercent(value: number): string {
  const formatted = `${(value * 100).toFixed(2)}%`;
  return value >= 0 ? `${colors.green}${formatted}${colors.reset}` : `${colors.red}${formatted}${colors.reset}`;
}

// Format currency
function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

// Render the dashboard
function renderDashboard(metrics: PerformanceMetrics | null): void {
  // Clear terminal
  console.clear();
  
  if (!metrics) {
    console.log(`${colors.yellow}⚠️ No performance data available.${colors.reset}`);
    console.log(`${colors.yellow}Make sure the bot is running and the state file exists at:${colors.reset}`);
    console.log(`${colors.yellow}${STATE_FILE}${colors.reset}`);
    return;
  }
  
  // Calculate performance
  const totalPnl = metrics.currentBalance - metrics.startingBalance;
  const totalPnlPercent = metrics.startingBalance > 0 ? totalPnl / metrics.startingBalance : 0;
  
  const dailyPnl = metrics.currentBalance - metrics.dailyStartBalance;
  const dailyPnlPercent = metrics.dailyStartBalance > 0 ? dailyPnl / metrics.dailyStartBalance : 0;
  
  const drawdown = metrics.highWaterMark > 0 ? 
    (metrics.highWaterMark - metrics.currentBalance) / metrics.highWaterMark : 0;
  
  // Header
  console.log(`${colors.cyan}=============================================${colors.reset}`);
  console.log(`${colors.cyan}       SOLMEMEBOT PERFORMANCE DASHBOARD      ${colors.reset}`);
  console.log(`${colors.cyan}=============================================${colors.reset}\n`);
  
  // System status
  const statusColor = metrics.systemEnabled ? colors.green : colors.red;
  console.log(`${colors.blue}System Status:${colors.reset} ${statusColor}${metrics.systemEnabled ? 'ACTIVE' : 'DISABLED'}${colors.reset}`);
  console.log(`${colors.blue}Last Updated:${colors.reset} ${new Date(metrics.lastUpdated).toLocaleString()}`);
  
  // Key metrics
  console.log(`\n${colors.magenta}💰 ACCOUNT BALANCE${colors.reset}`);
  console.log(`Current Balance:   ${formatCurrency(metrics.currentBalance)}`);
  console.log(`Starting Balance:  ${formatCurrency(metrics.startingBalance)}`);
  console.log(`High Water Mark:   ${formatCurrency(metrics.highWaterMark)}`);
  console.log(`Daily Start:       ${formatCurrency(metrics.dailyStartBalance)}`);
  console.log(`Active Positions:  ${metrics.activePositions}`);
  
  console.log(`\n${colors.magenta}📈 PERFORMANCE${colors.reset}`);
  console.log(`Total P&L:         ${formatCurrency(totalPnl)} (${formatPercent(totalPnlPercent)})`);
  console.log(`Daily P&L:         ${formatCurrency(dailyPnl)} (${formatPercent(dailyPnlPercent)})`);
  console.log(`Current Drawdown:  ${formatPercent(drawdown)}`);
  console.log(`Avg Max Drawdown:  ${formatPercent(metrics.averageMaxDrawdown || 0)}`);
  
  console.log(`\n${colors.magenta}🎯 TRADE STATISTICS${colors.reset}`);
  console.log(`Total Trades:      ${metrics.totalTrades}`);
  console.log(`Winning Trades:    ${metrics.winningTrades} (${formatPercent(metrics.winningTrades / (metrics.totalTrades || 1))})`);
  console.log(`Losing Trades:     ${metrics.losingTrades} (${formatPercent(metrics.losingTrades / (metrics.totalTrades || 1))})`);
  console.log(`Profit Factor:     ${metrics.profitFactor.toFixed(2)}`);
  console.log(`Average P&L:       ${formatPercent(metrics.averagePnl || 0)}`);
  
  // Bar chart for pattern performance
  // NOTE: In a real implementation, you would load this data from the trade history
  console.log(`\n${colors.magenta}🔍 PATTERN PERFORMANCE${colors.reset}`);
  const patternPerformance = createBarChart(
    [187.5, 75.9, 66.8, 61.0, 55.3],
    ['Mega Pump', 'Vol Squeeze', 'Smart Trap', 'Stop Hunt', 'Reversal'],
    'Pattern Returns (%)'
  );
  console.log(patternPerformance);
  
  // Simple line chart for balance history
  // NOTE: In a real implementation, you would load historical balance data
  console.log(`\n${colors.magenta}📊 BALANCE HISTORY${colors.reset}`);
  // Generate some sample data points (in a real app, these would come from state history)
  const sampleBalanceData = [
    metrics.startingBalance,
    metrics.startingBalance * 1.05,
    metrics.startingBalance * 1.03,
    metrics.startingBalance * 1.07,
    metrics.startingBalance * 1.04,
    metrics.startingBalance * 1.08,
    metrics.startingBalance * 1.12,
    metrics.currentBalance
  ];
  const balanceChart = createLineChart(sampleBalanceData, 'Balance Over Time');
  console.log(balanceChart);
  
  // Footer
  console.log(`\n${colors.cyan}=============================================${colors.reset}`);
  console.log(`Dashboard updates every ${REFRESH_INTERVAL_MS / 1000} seconds. Press Ctrl+C to exit.`);
  console.log(`${colors.cyan}=============================================${colors.reset}`);
}

// Main function
function main(): void {
  // Initial render
  const metrics = loadPerformanceData();
  renderDashboard(metrics);
  
  // Set up auto-refresh
  setInterval(() => {
    const updatedMetrics = loadPerformanceData();
    renderDashboard(updatedMetrics);
  }, REFRESH_INTERVAL_MS);
  
  // Handle exit
  process.on('SIGINT', () => {
    console.log('\nExiting dashboard...');
    process.exit(0);
  });
}

// Run main function
main();
