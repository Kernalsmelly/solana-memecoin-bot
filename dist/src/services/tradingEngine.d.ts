import { PublicKey } from '@solana/web3.js';
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
    private connection;
    getPositions(): PositionInfo[];
    private checkSellCriteria;
    /**
     * Helper function to send and confirm a transaction with optional priority fees and timeout.
     */
    private sendAndConfirmTransaction;
    /**
     * Executes a buy order for a specified token.
     */
    buyToken(outputMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean>;
    /**
     * Executes a sell order for a specified token.
     */
    sellToken(tokenMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean>;
}
export {};
//# sourceMappingURL=tradingEngine.d.ts.map