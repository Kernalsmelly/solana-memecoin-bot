export interface Fill {
    action: 'buy' | 'sell';
    tokenAddress: string;
    tokenSymbol?: string;
    quantity: number;
    price: number;
    meta?: Record<string, any>;
    timestamp?: number;
}
export interface PnLSummary {
    totalPnL: number;
    maxDrawdown: number;
    wins: number;
    losses: number;
}
export declare function computePnLSummary(fills: Fill[]): PnLSummary;
//# sourceMappingURL=pnlStats.d.ts.map