import { Connection } from '@solana/web3.js';
export interface BacktestGrid {
    PRICE_CHANGE_THRESHOLD: number[];
    VOLUME_MULTIPLIER: number[];
}
export interface BacktestResult {
    strategy: string;
    params: {
        priceChangeThreshold: number;
        volumeMultiplier: number;
    };
    patternMatchCount: number;
    netPnL: number;
}
export declare class Trader {
    private conn;
    private patternOnly;
    constructor(conn: Connection, opts?: {
        patternOnly?: boolean;
    });
    /**
     * Backtest and auto-tune thresholds for pattern strategies over recent on-chain data.
     * Updates config and emits events/metrics.
     */
    backtestAndApplyThresholds({ minutes, grid, }: {
        minutes?: number;
        grid?: BacktestGrid;
    }): Promise<BacktestResult[]>;
    /**
     * Async generator that yields pattern match signals for live trading integration.
     * PILOT PATCH: Only mock logic, no real API calls or duplicate imports
     */
    streamPatternSignals({ minutes }?: {
        minutes?: number;
    }): AsyncGenerator<{
        mint: string;
        price: number;
        bar: {
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
            timestamp: number;
            mint: string;
        };
    }, void, unknown>;
    runPilot({ minutes, maxTrades }: {
        minutes?: number;
        maxTrades?: number;
    }): Promise<void>;
}
//# sourceMappingURL=Trader.d.ts.map