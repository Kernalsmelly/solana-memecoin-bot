import { Position, RiskMetrics, TradingState, TradeHistoryEntry } from './types';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import logger from './utils/logger';

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
            state.positions = state.positions.filter(p => p.tokenAddress !== position.tokenAddress);
            state.positions.push(position);
            this.saveState(state);
        } catch (error) {
            logger.error('Error saving position:', error);
        }
    }

    public deletePosition(tokenAddress: string): void {
        try {
            const state = this.loadState();
            state.positions = state.positions.filter(p => p.tokenAddress !== tokenAddress);
            this.saveState(state);
        } catch (error) {
            logger.error('Error deleting position:', error);
        }
    }

    public saveRiskMetrics(metrics: RiskMetrics): void {
        try {
            const state = this.loadState();
            state.riskMetrics = metrics;
            this.saveState(state);
        } catch (error) {
            logger.error('Error saving risk metrics:', error);
        }
    }

    public addTradeHistory(entry: TradeHistoryEntry): void {
        try {
            const history = this.loadTradeHistory();
            history.push(entry);
            writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
        } catch (error) {
            logger.error('Error adding trade history:', error);
        }
    }

    public loadState(): TradingState {
        try {
            if (!existsSync(this.stateFile)) {
                return {
                    positions: [],
                    riskMetrics: {
                        currentBalance: 1000,
                        dailyPnL: 0,
                        drawdown: 0,
                        winRate: 0,
                        activePositions: 0,
                        availablePositions: 3,
                        highWaterMark: 1000,
                        dailyLoss: 0
                    },
                    timestamp: Date.now()
                };
            }

            const data = readFileSync(this.stateFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Error loading state:', error);
            return {
                positions: [],
                riskMetrics: {
                    currentBalance: 1000,
                    dailyPnL: 0,
                    drawdown: 0,
                    winRate: 0,
                    activePositions: 0,
                    availablePositions: 3,
                    highWaterMark: 1000,
                    dailyLoss: 0
                },
                timestamp: Date.now()
            };
        }
    }

    private saveState(state: TradingState): void {
        try {
            writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
        } catch (error) {
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
            logger.error('Error loading trade history:', error);
            return [];
        }
    }

    public exportTradeHistoryToCsv(outputFile: string): void {
        try {
            const history = this.loadTradeHistory();
            const headers = ['timestamp', 'tokenAddress', 'tokenSymbol', 'action', 'price', 'size', 'pnl'];
            const rows = history.map(entry => {
                return [
                    new Date(entry.timestamp).toISOString(),
                    entry.position.tokenAddress,
                    entry.position.tokenSymbol,
                    entry.action,
                    entry.price,
                    entry.size,
                    entry.pnl || 0
                ].join(',');
            });

            const csv = [headers.join(','), ...rows].join('\n');
            writeFileSync(outputFile, csv);
        } catch (error) {
            logger.error('Error exporting trade history:', error);
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
        }
    }
}