import { Connection, Keypair } from '@solana/web3.js';
import { TradeOrder } from './types';
export interface OrderExecutionConfig {
    slippageBps?: number;
}
export interface OrderExecutionResult {
    success: boolean;
    inputAmount?: bigint;
    outputAmount?: bigint;
    txSignature?: string;
    error?: string;
    actualExecutionPrice?: number;
    timestamp?: number;
    details?: any;
}
export interface OrderExecution {
    executeOrder(order: TradeOrder): Promise<OrderExecutionResult>;
    getTokenDecimals(tokenAddress: string): Promise<number>;
}
export declare class LiveOrderExecution implements OrderExecution {
    private connection;
    private wallet;
    private jupiterApi;
    private slippageBps;
    private tokenDecimalsCache;
    constructor(connection: Connection, wallet: Keypair, config?: OrderExecutionConfig);
    /**
     * Fetches and caches the decimals for a given token mint.
     * @param tokenMint The mint address of the token.
     * @returns The number of decimals.
     */
    getTokenDecimals(tokenMint: string): Promise<number>;
    /**
     * Fetches a swap quote from Jupiter API.
     * @param inputMint Input token mint address.
     * @param outputMint Output token mint address.
     * @param amount Amount of input token in smallest unit (e.g., lamports).
     * @param slippageBps Slippage tolerance in basis points.
     * @returns {Promise<QuoteResponse | null>} The quote response or null if failed.
     */
    private getSwapQuote;
    /**
     * Executes a swap transaction based on a Jupiter quote.
     * @param quoteResponse The quote response from Jupiter API.
     * @returns {Promise<string | null>} Transaction signature or null if failed.
     */
    private executeSwapTransaction;
    /**
     * Buys a specified token using SOL.
     * @param tokenAddress The mint address of the token to buy.
     * @param amountInSolLamports The amount of SOL (in lamports) to spend.
     * @returns OrderExecutionResult
     */
    private buyTokenWithSol;
    /**
     * Sells a specified token for SOL.
     * @param tokenAddress The mint address of the token to sell.
     * @param amountToSellInSmallestUnit The amount of the token (in its smallest unit) to sell.
     * @returns OrderExecutionResult
     */
    private sellTokenForSol;
    executeOrder(order: TradeOrder): Promise<OrderExecutionResult>;
}
export declare function createOrderExecution(connection: Connection, wallet?: Keypair, config?: OrderExecutionConfig): OrderExecution;
//# sourceMappingURL=orderExecution.d.ts.map