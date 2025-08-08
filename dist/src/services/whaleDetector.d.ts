import { Connection } from '@solana/web3.js';
import { EventEmitter } from 'events';
interface WhaleSignalOptions {
    whaleThresholdUsdc: number;
    whaleWindowSec: number;
    usdcMint: string;
    solMint: string;
}
export declare class WhaleSignalDetector extends EventEmitter {
    private connection;
    private options;
    private recentSignals;
    private subscriptionId;
    constructor(connection: Connection, options: WhaleSignalOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private processAccountChange;
    private parseTransferAmount;
    private extractTokenMint;
    private handleWhaleSignal;
    hasRecentSignal(tokenMint: string): boolean;
}
export {};
//# sourceMappingURL=whaleDetector.d.ts.map