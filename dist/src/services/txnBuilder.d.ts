import { Connection, TransactionInstruction, Keypair } from '@solana/web3.js';
interface TxnBuilderOptions {
    priorityFee: number;
    maxRetries: number;
    retryDelayMs: number;
}
export declare class TxnBuilder {
    constructor(connection: Connection, options?: Partial<TxnBuilderOptions>);
    private connection;
    private options;
    private lastPriorityFee;
    private txTemplates;
    get priorityFee(): number;
    /**
     * Build and sign a transaction template for a pool and type ('buy' or 'sell').
     * Placeholders: amount/price/fee are set as dummy values, to be replaced at send time.
     * Stores the template in memory for later fast execution.
     */
    buildTemplateTx(poolInfo: {
        poolKey: string;
        inputMint: string;
        outputMint: string;
    }, type: 'buy' | 'sell', signers: Keypair[]): Promise<void>;
    /**
     * Fill and send a pre-built transaction template for a pool and type.
     * Replaces placeholders with actual amount/fee, signs if needed, and broadcasts.
     */
    fillAndSendTemplateTx(poolKey: string, type: 'buy' | 'sell', amount: number, fee: number, signers: Keypair[]): Promise<string>;
    buildAndSend(instructions: TransactionInstruction[], signers: Keypair[], blockhash?: string): Promise<string>;
    adjustPriorityFee(currentLatency: number): Promise<void>;
}
export {};
//# sourceMappingURL=txnBuilder.d.ts.map