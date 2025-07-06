import { EventEmitter } from 'events';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
export interface SwapParams {
    inputMint: string;
    outputMint: string;
    amountIn: number;
    slippageBps?: number;
    userPublicKey: string;
    meta?: Record<string, any>;
}
export interface SwapResult {
    success: boolean;
    txSignature?: string;
    reason?: string;
}
export interface Signer {
    publicKey: PublicKey;
    signTransaction(tx: Transaction): Promise<Transaction>;
}
export declare class JupiterOrderExecution extends EventEmitter {
    private connection;
    private signer;
    private jupiterApi;
    constructor(connection: Connection, signer: Signer, jupiterApi?: string);
    executeSwap(params: SwapParams): Promise<SwapResult>;
}
export default JupiterOrderExecution;
//# sourceMappingURL=jupiterOrderExecution.d.ts.map