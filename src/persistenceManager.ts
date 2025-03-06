// src/persistenceManager.ts

import fs from 'fs';
import path from 'path';
import { Position, Trade, AccountBalance } from './positionManager';

export interface TradeHistoryEntry extends Trade {
  positionId: string;
  balanceAfterTrade: number;
}

export interface TradingState {
  positions: Position[];
  accountBalance: AccountBalance;
  tradeHistory: TradeHistoryEntry[];
  lastUpdated: number;
}

export class PersistenceManager {
  private dataDir: string;
  private stateFile: string;
  private tradeHistoryFile: string;
  
  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    this.stateFile = path.join(dataDir, 'trading_state.json');
    this.tradeHistoryFile = path.join(dataDir, 'trade_history.json');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }
  
  /**
   * Save the current trading state
   */
  public async saveState(tradingState: TradingState): Promise<void> {
    try {
      // Add timestamp
      tradingState.lastUpdated = Date.now();
      
      // Convert to JSON string
      const stateJson = JSON.stringify(tradingState, null, 2);
      
      // Write to file
      await fs.promises.writeFile(this.stateFile, stateJson, 'utf8');
      
      // Also update trade history file
      await this.appendTradeHistory(tradingState.tradeHistory);
      
      console.log(`Trading state saved: ${this.stateFile}`);
    } catch (error) {
      console.error(`Failed to save trading state: ${error}`);
      throw error;
    }
  }
  
  /**
   * Load trading state from file
   */
  public async loadState(): Promise<TradingState | null> {
    try {
      // Check if file exists
      if (!fs.existsSync(this.stateFile)) {
        console.log(`No trading state file found: ${this.stateFile}`);
        return null;
      }
      
      // Read file content
      const stateJson = await fs.promises.readFile(this.stateFile, 'utf8');
      
      // Parse JSON
      const tradingState = JSON.parse(stateJson) as TradingState;
      
      console.log(`Trading state loaded: ${this.stateFile}`);
      return tradingState;
    } catch (error) {
      console.error(`Failed to load trading state: ${error}`);
      return null;
    }
  }
  
  /**
   * Append new trades to trade history file
   */
  private async appendTradeHistory(trades: TradeHistoryEntry[]): Promise<void> {
    try {
      // Create or load existing history
      let history: TradeHistoryEntry[] = [];
      
      if (fs.existsSync(this.tradeHistoryFile)) {
        const existingHistory = await fs.promises.readFile(this.tradeHistoryFile, 'utf8');
        history = JSON.parse(existingHistory);
      }
      
      // Filter out duplicate trades (by ID)
      const existingIds = new Set(history.map(trade => trade.id));
      const newTrades = trades.filter(trade => !existingIds.has(trade.id));
      
      // Add new trades
      history.push(...newTrades);
      
      // Sort by timestamp
      history.sort((a, b) => a.timestamp - b.timestamp);
      
      // Write back to file
      await fs.promises.writeFile(
        this.tradeHistoryFile, 
        JSON.stringify(history, null, 2), 
        'utf8'
      );
    } catch (error) {
      console.error(`Failed to append trade history: ${error}`);
    }
  }
  
  /**
   * Create a backup of the current state
   */
  public async createBackup(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(this.dataDir, 'backups');
      
      // Ensure backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      // Create backup file paths
      const stateBackupFile = path.join(backupDir, `trading_state_${timestamp}.json`);
      const historyBackupFile = path.join(backupDir, `trade_history_${timestamp}.json`);
      
      // Copy files if they exist
      if (fs.existsSync(this.stateFile)) {
        await fs.promises.copyFile(this.stateFile, stateBackupFile);
      }
      
      if (fs.existsSync(this.tradeHistoryFile)) {
        await fs.promises.copyFile(this.tradeHistoryFile, historyBackupFile);
      }
      
      return backupDir;
    } catch (error) {
      console.error(`Failed to create backup: ${error}`);
      throw error;
    }
  }
  
  /**
   * Export trade history to CSV
   */
  public async exportTradeHistoryToCsv(outputFile: string): Promise<string> {
    try {
      // Check if trade history exists
      if (!fs.existsSync(this.tradeHistoryFile)) {
        throw new Error(`No trade history file found: ${this.tradeHistoryFile}`);
      }
      
      // Read trade history
      const historyJson = await fs.promises.readFile(this.tradeHistoryFile, 'utf8');
      const history = JSON.parse(historyJson) as TradeHistoryEntry[];
      
      // Create CSV header
      const headers = [
        'ID',
        'Token',
        'Type',
        'Price',
        'Quantity',
        'Timestamp',
        'Date',
        'Fees',
        'Total Cost',
        'Balance After'
      ];
      
      // Create CSV rows
      const rows = history.map(trade => [
        trade.id,
        trade.tokenMint,
        trade.orderType,
        trade.price,
        trade.quantity,
        trade.timestamp,
        new Date(trade.timestamp).toISOString(),
        trade.fees,
        trade.totalCost,
        trade.balanceAfterTrade
      ]);
      
      // Combine header and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');
      
      // Write to output file
      await fs.promises.writeFile(outputFile, csvContent, 'utf8');
      
      return outputFile;
    } catch (error) {
      console.error(`Failed to export trade history: ${error}`);
      throw error;
    }
  }
  
  /**
   * Clear all trading data (use with caution!)
   */
  public async clearAllData(): Promise<void> {
    try {
      // Create backup before clearing
      await this.createBackup();
      
      // Delete state and history files
      if (fs.existsSync(this.stateFile)) {
        await fs.promises.unlink(this.stateFile);
      }
      
      if (fs.existsSync(this.tradeHistoryFile)) {
        await fs.promises.unlink(this.tradeHistoryFile);
      }
      
      console.log('All trading data cleared');
    } catch (error) {
      console.error(`Failed to clear trading data: ${error}`);
      throw error;
    }
  }
}