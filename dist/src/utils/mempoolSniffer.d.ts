import { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';
import EventEmitter from 'events';
export interface MempoolSnifferEvents {
    mintDetected: (mintAddress: string, tx: ParsedTransactionWithMeta) => void;
    lpAddDetected: (lpAddress: string, mintAddress: string, tx: ParsedTransactionWithMeta) => void;
}
export declare class MempoolSniffer extends EventEmitter {
    private connection;
    private running;
    constructor(connection: Connection);
    start(): Promise<void>;
    stop(): void;
}
//# sourceMappingURL=mempoolSniffer.d.ts.map