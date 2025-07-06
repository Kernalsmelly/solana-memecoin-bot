import { Connection, Keypair } from '@solana/web3.js';
import { Config } from '../utils/config';
interface PositionInfo {
    entryPrice: number;
    entryTimestamp: number;
    amountBoughtUi: number | undefined;
    pairAddress: string;
}
export declare class TradingEngine {
    private riskManager;
    private parameterFeedbackLoop;
    private volatilitySqueeze;
    /**
     * Returns all current positions as an array
     */
    getPositions(): PositionInfo[];
    private connection;
    private config;
    private wallet;
    private currentPositions;
    private jupiterApi;
    private usdcMint;
    private positionsFilePath;
    private usdcDecimals;
    private maxPositions;
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
    evaluateToken(marketData: any): void;
}
export {};
//# sourceMappingURL=tradingEngine.bak.d.ts.map