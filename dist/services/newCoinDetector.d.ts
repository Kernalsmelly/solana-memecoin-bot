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
    private tokenDiscovery;
    private birdeyeListenerActive;
    attachTokenDiscovery(tokenDiscovery: any): void;
    private connection;
    private config;
    private jupiterApi;
    private processedSignatures;
    private pollingActive;
    private pollIntervalId;
    private pollingIntervalMs;
    private isPolling;
    private lastProcessedSignatureForPolling;
    private rpcCallCount;
    private rpcCallResetTime;
    private readonly MAX_RPC_CALLS_PER_MINUTE;
    private processedPools;
    private readonly MAX_PROCESSED_POOLS;
    private readonly MAX_POOLS_TO_PROCESS;
    private readonly DELAY_BETWEEN_POOLS_MS;
    constructor(connection: Connection, config: Config);
    start(): void;
    stop(): void;
    private fetchOnChainPools;
    /**
     * Fetch pools from Raydium API (HTTP request, not RPC call)
     * @returns Array of pool data or empty array if failed
     */
    private fetchRaydiumPools;
    /**
     * Process a Raydium pool and emit event if it's a valid new pool
     * @param pool The pool data from Raydium API
     */
    private processRaydiumPool;
    /**
     * Poll for new pools using on-chain data as fallback
     */
    private pollOnChain;
    /**
     * Rate limiter for RPC calls to prevent excessive QuickNode usage
     * Uses both local and global rate limiters for better control
     * @returns true if the call is allowed, false if it should be throttled
     */
    private checkRpcRateLimit;
    private pollForNewPools;
    private processSignature;
}
//# sourceMappingURL=newCoinDetector.d.ts.map