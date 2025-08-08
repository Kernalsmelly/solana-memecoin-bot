import { Connection } from '@solana/web3.js';
import EventEmitter from 'events';
export interface WhaleSignalEvent {
    tokenMint: string;
    poolAddress: string;
    usdcAmount: number;
    slot: number;
    blockTime: number | null;
}
export declare class WhaleSignalWatcher extends EventEmitter {
    private connection;
    private usdcMint;
    private threshold;
    private seenPools;
    constructor(connection: Connection, usdcMint: string, threshold?: number);
    start(): void;
}
//# sourceMappingURL=whaleSignalWatcher.d.ts.map