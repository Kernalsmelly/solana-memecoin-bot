import { Position, RiskMetrics, TradingState, TradeHistoryEntry } from './/types.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import logger from './/utils/logger.js';
import { tradeLogger } from './/utils/tradeLogger.js';

export class PersistenceManager {
  private dataDir: string;
  private stateFile: string;
  private historyFile: string;
  private backupDir: string;

  constructor() {
    this.dataDir = join(process.cwd(), 'data');
    this.stateFile = join(this.dataDir, 'trading_state.json');
    this.historyFile = join(this.dataDir, 'trade_history.json');
    this.backupDir = join(this.dataDir, 'backups');

    // Create directories if they don't exist
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir);
    }
  }

  public savePosition(position: Position): void {
    try {
      const state = this.loadState();
      state.positions = state.positions.filter(
        (p: any) => p.tokenAddress !== position.tokenAddress,
      );
      state.positions.push(position);
      this.saveState(state);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('PersistenceManager error:', error);
      } else {
        logger.error('Unknown error:', String(error));
      }
    }
  }

  public deletePosition(tokenAddress: string): void {
    try {
      const state = this.loadState();
      state.positions = state.positions.filter((p: any) => p.tokenAddress !== tokenAddress);
      this.saveState(state);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('PersistenceManager error:', error);
      } else {
        logger.error('Unknown error:', String(error));
      }
    }
  }

  public saveRiskMetrics(metrics: RiskMetrics): void {
    try {
      const state = this.loadState();
      state.riskMetrics = metrics;
      this.saveState(state);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('PersistenceManager error:', error);
      } else {
        logger.error('Unknown error:', String(error));
      }
    }
  }

  public addTradeHistory(entry: TradeHistoryEntry): void {
    try {
      const history = this.loadTradeHistory();
      history.push(entry);
      writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      if (error instanceof Error) {
        logger.error('PersistenceManager error:', error);
      } else {
        logger.error('Unknown error:', String(error));
      }
    }
  }

  public loadState(): TradingState {
    try {
      if (!existsSync(this.stateFile)) {
        return {
          positions: [] as Position[],
          riskMetrics: {
            maxDrawdown: 0,
            maxDailyLoss: 0,
            activePositions: 0,
            pnl: 0,
            currentBalance: 1000,
            dailyPnL: 0,
            drawdown: 0,
            winRate: 0,
            availablePositions: 3,
            highWaterMark: 1000,
            dailyLoss: 0,
            minute: 0,
            hour: 0,
            day: 0,
          },
          allocatedCash: 0,
          totalValue: 0,
          timestamp: Date.now(),
        };
      }

      const data = readFileSync(this.stateFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('PersistenceManager error:', error);
      } else {
        logger.error('Unknown error:', String(error));
      }

      return {
        positions: [],
        riskMetrics: {
          maxDrawdown: 0,
          maxDailyLoss: 0,
          activePositions: 0,
          pnl: 0,
          currentBalance: 1000,
          dailyPnL: 0,
          drawdown: 0,
          winRate: 0,
          availablePositions: 3,
          highWaterMark: 1000,
          dailyLoss: 0,
        },
        allocatedCash: 0,
        totalValue: 0,
        timestamp: Date.now(),
      };
    }
  }

  private saveState(state: TradingState): void {
    try {
      writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      if (error instanceof Error) {
        logger.error('PersistenceManager error:', error);
      } else {
        logger.error('Unknown error:', String(error));
      }

      logger.error('Error saving state:', error);
    }
  }

  private loadTradeHistory(): TradeHistoryEntry[] {
    try {
      if (!existsSync(this.historyFile)) {
        return [];
      }

      const data = readFileSync(this.historyFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('PersistenceManager error:', error);
      } else {
        logger.error('Unknown error:', String(error));
      }

      logger.error('Error loading trade history:', error);
      return [];
    }
  }

  public exportTradeHistoryToCsv(outputFile: string): void {
    try {
      const history = this.loadTradeHistory();
      const headers = [
        'timestamp',
        'tokenAddress',
        'tokenSymbol',
        'action',
        'price',
        'size',
        'pnl',
      ];
      const rows = history.map((entry) => {
        return [
          new Date(entry.timestamp).toISOString(),
          entry.position.tokenAddress,
          entry.position.tokenSymbol,
          entry.action,
          entry.price,
          entry.size,
          entry.pnl || 0,
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');
      writeFileSync(outputFile, csv);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('PersistenceManager error:', error);
      } else {
        logger.error('Unknown error:', String(error));
      }

      logger.error('Error exporting trade history:', error);
      tradeLogger.logScenario('PERSISTENCE_ERROR', {
        event: 'exportTradeHistory',
        file: outputFile,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }

  public createBackup(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = join(this.backupDir, `backup_${timestamp}.json`);
      const state = this.loadState();
      writeFileSync(backupFile, JSON.stringify(state, null, 2));
    } catch (error) {
      logger.error('Error creating backup:', error);
      tradeLogger.logScenario('PERSISTENCE_ERROR', {
        event: 'saveState',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
