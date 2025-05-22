export interface TradeLogEntry {
    timestamp: string;
    action: 'BUY' | 'SELL' | 'SKIP';
    token: string;
    pairAddress?: string;
    price: number;
    amount?: number;
    pnl?: number;
    reason: string;
    txid?: string;
    success: boolean;
}
export declare class TradeLogger {
    logSummary(summary: Record<string, any>): void;
    logPoolDetection(pool: Record<string, any>): void;
    private logFile;
    private logDir;
    constructor(logDir?: string);
    log(entry: TradeLogEntry): void;
}
export declare const tradeLogger: TradeLogger;
//# sourceMappingURL=tradeLogger.d.ts.map