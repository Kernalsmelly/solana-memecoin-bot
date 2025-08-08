import { Connection } from '@solana/web3.js';
import EventEmitter from 'events';
export interface CongestionEvent {
    blockTimeMs: number;
    slot: number;
    threshold: number;
}
export declare class CongestionMonitor extends EventEmitter {
    private connection;
    private thresholdMs;
    private recentBlockTimes;
    private lastSlot;
    constructor(connection: Connection, thresholdMs?: number);
    start(): void;
}
//# sourceMappingURL=congestionMonitor.d.ts.map