/**
 * Handles a dry-run fill for a simulated swap. Records trade with risk manager and logs the fill.
 * @param params - Details of the simulated fill
 */
export declare function handleDryRunFill(params: {
    action: 'buy' | 'sell';
    tokenAddress: string;
    tokenSymbol?: string;
    quantity: number;
    price: number;
    meta?: Record<string, any>;
}, injectedRiskManager?: {
    recordTrade: (pnl: number) => void;
}): Promise<void>;
//# sourceMappingURL=dryRunFill.d.ts.map