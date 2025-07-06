export interface TradeLogEntry {
    timestamp: string;
    action: 'buy' | 'sell' | 'skip';
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
    /**
     * Logs a scenario event (e.g., circuit breaker, emergency stop, pattern trigger, error).
     * @param scenarioName Name of the scenario or event
     * @param details      Details or metadata (object or string)
     */
    logScenario(scenarioName: string, details: Record<string, any> | string): void;
}
export declare const tradeLogger: TradeLogger;
//# sourceMappingURL=tradeLogger.d.ts.map