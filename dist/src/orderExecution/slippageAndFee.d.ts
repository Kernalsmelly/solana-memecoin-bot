import { Connection, Transaction } from '@solana/web3.js';
export declare function getFeeEstimate(connection: Connection, tx: Transaction): Promise<number>;
export declare function isSlippageTooHigh(quoteSlippageBps: number, limitBps: number): boolean;
export interface SlippageWarningEvent {
    type: 'slippageWarning';
    quoteSlippageBps: number;
    limitBps: number;
    context?: any;
}
//# sourceMappingURL=slippageAndFee.d.ts.map