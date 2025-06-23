export interface Trade {
    type: 'buy' | 'sell';
    quantity: number;
    price: number;
    timestamp: number;
}
export interface Position {
    tokenMint: string;
    tokenSymbol: string;
    tokenDecimals: number;
    quantity: number;
    entryPrice: number;
    trades: Trade[];
}
export interface AccountBalance {
    availableCash: number;
    allocatedCash: number;
    totalValue: number;
}
export interface PositionPnL {
    tokenMint: string;
    tokenSymbol: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
}
export declare class PositionManager {
    private accountBalance;
    private positions;
    constructor(initialBalance: number);
    /**
     * Fetches the current price of a token using the external price feed.
     * @param tokenMint - The token's address (mint).
     * @returns The current token price in USD.
     */
    fetchTokenPrice(tokenMint: string): Promise<number>;
    getAccountBalance(): AccountBalance;
    getAllPositions(): Position[];
    getPosition(tokenMint: string): Position | null;
    /**
     * Opens a new position for a token.
     * @param tokenMint - Token address.
     * @param tokenSymbol - Token symbol (e.g., "SOL").
     * @param tokenDecimals - Number of decimals for the token.
     * @param quantity - Quantity purchased.
     * @param entryPrice - Price at which the token was purchased.
     * @returns The newly created position.
     */
    openPosition(tokenMint: string, tokenSymbol: string, tokenDecimals: number, quantity: number, entryPrice: number): Promise<Position>;
    /**
     * Calculates real-time PnL for a single position.
     */
    getPositionPnL(tokenMint: string): Promise<PositionPnL | null>;
    /**
     * Calculates real-time PnL for all open positions.
     */
    getAllPositionsPnL(): Promise<PositionPnL[]>;
    /**
     * Checks if a position should be exited due to stop-loss, take-profit, trailing stop, or time-based exit.
     * Returns a reason string if exit is triggered, otherwise null.
     * (Stub logic, to be filled in with advanced rules)
     */
    checkExitTriggers(tokenMint: string): Promise<string | null>;
    /**
     * (Stub) Applies trailing stop logic for a position. To be filled in with advanced rules.
     */
    applyTrailingStop(tokenMint: string): Promise<void>;
    /**
     * (Stub) Applies time-based exit logic for a position. To be filled in with advanced rules.
     */
    applyTimeBasedExit(tokenMint: string): Promise<void>;
    closePosition(tokenMint: string, quantityToSell: number, sellPrice: number): Promise<Position | null>;
    /**
     * Updates the current market price for a given token position.
     * @param tokenMint - Token address.
     */
    updatePositionPrice(tokenMint: string): Promise<void>;
    /**
     * Updates the portfolio's total value by summing available cash and the market value of open positions.
     */
    updatePortfolioValue(): Promise<void>;
    /**
     * Synchronously updates the total value based on available and allocated cash.
     * (For immediate updates without current prices.)
     */
    private updateTotalValue;
}
//# sourceMappingURL=positionManager.d.ts.map