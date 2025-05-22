import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Config } from '../utils/config';
import { MarketDataUpdateEvent } from './priceWatcher';
export declare class TradingEngine {
    private connection;
    private config;
    private wallet;
    private currentPositions;
    private jupiterApi;
    private usdcMint;
    private positionsFilePath;
    private usdcDecimals;
    constructor(connection: Connection, config: Config, wallet: Keypair);
    /**
     * Fetches and caches the decimals for the configured USDC mint.
     */
    private initializeUsdcDecimals;
    /**
     * Loads the current positions from the state file.
     */
    private loadPositions;
    /**
     * Saves the current positions to the state file.
     */
    private savePositions;
    /**
     * Evaluates market data for a token and decides whether to trade.
     * This method is intended to be called when PriceWatcher emits marketDataUpdate.
     * @param marketData The latest market data for the token.
     */
    evaluateToken(marketData: MarketDataUpdateEvent): void;
    private checkBuyCriteria;
    private checkSellCriteria;
    /**
     * Helper function to send and confirm a transaction with optional priority fees and timeout.
     * @param transaction The VersionedTransaction to send.
     * @param description A brief description for logging (e.g., 'BUY' or 'SELL').
     * @returns The transaction signature if successful, null otherwise.
     */
    private sendAndConfirmTransaction;
    /**
     * Executes a buy order for a specified token.
     * @param outputMint The mint address of the token to buy.
     * @param pairAddress The AMM pool address for the token (optional, for logging/PL).
     * @param marketData The latest market data for the token (optional, for logging/PL).
     * @returns True if the buy operation succeeded, false otherwise.
     */
    buyToken(outputMint: PublicKey, pairAddress?: string, marketData?: MarketDataUpdateEvent): Promise<boolean>;
    /**
     * Executes a sell order for a specified token.
     * @param tokenMint The mint address of the token to sell.
     * @param pairAddress The AMM pool address for the token (optional, for logging/PL).
     * @returns True if the sell operation succeeded, false otherwise.
     */
    sellToken(tokenMint: PublicKey, pairAddress?: string): Promise<boolean>;
}
//# sourceMappingURL=tradingEngine.d.ts.map