import { Position, RiskMetrics, TradingState, TradeHistoryEntry } from './types';
export declare class PersistenceManager {
    private dataDir;
    private stateFile;
    private historyFile;
    private backupDir;
    constructor();
    savePosition(position: Position): void;
    deletePosition(tokenAddress: string): void;
    saveRiskMetrics(metrics: RiskMetrics): void;
    addTradeHistory(entry: TradeHistoryEntry): void;
    loadState(): TradingState;
    private saveState;
    private loadTradeHistory;
    exportTradeHistoryToCsv(outputFile: string): void;
    createBackup(): void;
}
//# sourceMappingURL=persistenceManager.d.ts.map