import { EventEmitter } from 'events';
import { Connection } from '@solana/web3.js';
import { Config } from '../utils/config';
export interface NewPoolDetectedEvent {
    poolAddress: string;
    baseMint: string;
    quoteMint: string;
    lpMint: string;
    market: string;
    signature: string;
    timestamp: number;
}
export declare class NewCoinDetector extends EventEmitter {
    private connection;
    private config;
    private jupiterApi;
    private processedSignatures;
    private pollingActive;
    private pollingIntervalId;
    private pollingIntervalMs;
    private isPolling;
    private lastProcessedSignatureForPolling;
    constructor(connection: Connection, config: Config);
    /**
     * Manages the size of the processed signatures set, keeping only the most recent maxSize entries.
     */
    private manageRecentlyProcessedSet;
    start(): void;
    stop(): void;
    private pollForNewPools;
}
//# sourceMappingURL=newCoinDetector.d.ts.map