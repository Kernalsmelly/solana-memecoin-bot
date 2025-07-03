import { EventEmitter } from 'events';
export interface DryRunSwapParams {
    inputMint: string;
    outputMint: string;
    amountIn: number;
    slippageBps?: number;
    userPublicKey: string;
    meta?: Record<string, any>;
}
export interface DryRunSwapResult {
    success: boolean;
    simulated: boolean;
    txLog: any;
    reason?: string;
}
/**
 * DryRunOrderExecution simulates a Jupiter V6 swap and logs the unsigned transaction.
 * No real swap is sent; this is for safe testing and strategy development.
 */
export declare class DryRunOrderExecution extends EventEmitter {
    private riskManager?;
    /**
     * Optionally inject a risk manager for trade analytics.
     */
    constructor(riskManager?: {
        recordTrade: (pnl: number, meta?: any) => void;
    });
    /**
     * Simulate a swap and log the unsigned transaction details.
     * If a risk manager is present, records the dry-run trade with dummy PnL.
     */
    executeSwap(params: DryRunSwapParams): Promise<DryRunSwapResult>;
}
export default DryRunOrderExecution;
//# sourceMappingURL=index.d.ts.map