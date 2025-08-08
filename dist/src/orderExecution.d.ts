import { Connection, Keypair } from '@solana/web3.js';
import { TradeOrder, OrderExecutionResult, OrderExecution } from './/types.js';
export interface OrderExecutionConfig {
    slippageBps?: number;
}
export declare class LiveOrderExecution implements OrderExecution {
    /**
     * Stop/cleanup method for tests and integration
     */
    stop(): void;
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
     * Simulates a swap transaction using Jupiter's quote (preflight check).
     * Returns true if simulation passes, false otherwise.
     */
    private simulateSwap;
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
    /**
     * Attempts a buy with retry and simulation logic.
     */
    private buyTokenWithSol;
    /**
     * Sells a specified token for SOL.
     * @param tokenAddress The mint address of the token to sell.
     * @param amountToSellInSmallestUnit The amount of the token (in its smallest unit) to sell.
     * @returns OrderExecutionResult
     */
    /**
     * Attempts a sell with retry and simulation logic.
     */
    /**
     * Executes a trade order (buy or sell) and returns the result.
     * Implements OrderExecution interface.
     */
    executeOrder(order: TradeOrder): Promise<OrderExecutionResult>;
    private sellTokenForSol;
}
export declare function createOrderExecution(connection: Connection, wallet?: Keypair, config?: OrderExecutionConfig): OrderExecution;
//# sourceMappingURL=orderExecution.d.ts.map