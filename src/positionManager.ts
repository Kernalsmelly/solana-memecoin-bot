// src/positionManager.ts

import axios from 'axios';
import { fetchTokenPrice } from './utils/priceFeed';

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
  unrealizedPnL: number; // USD
  unrealizedPnLPercent: number;
}

export class PositionManager {
  private accountBalance: AccountBalance;
  private positions: Map<string, Position>;

  constructor(initialBalance: number) {
    this.accountBalance = {
      availableCash: initialBalance,
      allocatedCash: 0,
      totalValue: initialBalance,
    };
    this.positions = new Map();
  }

  /**
   * Fetches the current price of a token using the external price feed.
   * @param tokenMint - The token's address (mint).
   * @returns The current token price in USD.
   */
  public async fetchTokenPrice(tokenMint: string): Promise<number> {
    // Use the utility function from src/utils/priceFeed.ts
    return await fetchTokenPrice(tokenMint, 'usd');
  }

  public getAccountBalance(): AccountBalance {
    return this.accountBalance;
  }

  public getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  public getPosition(tokenMint: string): Position | null {
    return this.positions.get(tokenMint) || null;
  }

  /**
   * Opens a new position for a token.
   * @param tokenMint - Token address.
   * @param tokenSymbol - Token symbol (e.g., "SOL").
   * @param tokenDecimals - Number of decimals for the token.
   * @param quantity - Quantity purchased.
   * @param entryPrice - Price at which the token was purchased.
   * @returns The newly created position.
   */
  public async openPosition(
    tokenMint: string,
    tokenSymbol: string,
    tokenDecimals: number,
    quantity: number,
    entryPrice: number
  ): Promise<Position> {
    const position: Position = {
      tokenMint,
      tokenSymbol,
      tokenDecimals,
      quantity,
      entryPrice,
      trades: [{
        type: 'buy',
        quantity,
        price: entryPrice,
        timestamp: Date.now()
      }],
    };
    this.positions.set(tokenMint, position);
    // Deduct cost from available cash and add to allocated cash.
    const cost = quantity * entryPrice;
    this.accountBalance.availableCash -= cost;
    this.accountBalance.allocatedCash += cost;
    this.updateTotalValue();
    return position;
  }

  /**
   * Calculates real-time PnL for a single position.
   */
  public async getPositionPnL(tokenMint: string): Promise<PositionPnL | null> {
    const position = this.positions.get(tokenMint);
    if (!position) return null;
    const currentPrice = await this.fetchTokenPrice(tokenMint);
    const unrealizedPnL = (currentPrice - position.entryPrice) * position.quantity;
    const unrealizedPnLPercent = position.entryPrice > 0 ? (unrealizedPnL / (position.entryPrice * position.quantity)) * 100 : 0;
    return {
      tokenMint,
      tokenSymbol: position.tokenSymbol,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      currentPrice,
      unrealizedPnL,
      unrealizedPnLPercent
    };
  }

  /**
   * Calculates real-time PnL for all open positions.
   */
  public async getAllPositionsPnL(): Promise<PositionPnL[]> {
    const results: PositionPnL[] = [];
    for (const position of this.positions.values()) {
      const pnl = await this.getPositionPnL(position.tokenMint);
      if (pnl) results.push(pnl);
    }
    return results;
  }

  /**
   * Checks if a position should be exited due to stop-loss, take-profit, trailing stop, or time-based exit.
   * Returns a reason string if exit is triggered, otherwise null.
   * (Stub logic, to be filled in with advanced rules)
   */
  public async checkExitTriggers(tokenMint: string): Promise<string | null> {
    // TODO: Integrate with advanced logic (momentum, trailing stops, pattern triggers, etc.)
    // Example stub: exit if loss > 20% or gain > 50%
    const pnl = await this.getPositionPnL(tokenMint);
    if (!pnl) return null;
    if (pnl.unrealizedPnLPercent <= -20) return 'stop-loss';
    if (pnl.unrealizedPnLPercent >= 50) return 'take-profit';
    // TODO: Add trailing stop, time-based, and pattern-based exits
    return null;
  }

  /**
   * (Stub) Applies trailing stop logic for a position. To be filled in with advanced rules.
   */
  public async applyTrailingStop(tokenMint: string): Promise<void> {
    // TODO: Implement trailing stop logic (momentum, volatility, etc.)
  }

  /**
   * (Stub) Applies time-based exit logic for a position. To be filled in with advanced rules.
   */
  public async applyTimeBasedExit(tokenMint: string): Promise<void> {
    // TODO: Implement max holding period logic
  }

  public async closePosition(
    tokenMint: string,
    quantityToSell: number,
    sellPrice: number
  ): Promise<Position | null> {
    const position = this.positions.get(tokenMint);
    if (!position) {
      throw new Error(`No position found for token ${tokenMint}`);
    }
    if (quantityToSell > position.quantity) {
      throw new Error(`Cannot sell more than the current position quantity`);
    }
    position.trades.push({
      type: 'sell',
      quantity: quantityToSell,
      price: sellPrice,
      timestamp: Date.now()
    });
    position.quantity -= quantityToSell;
    const revenue = quantityToSell * sellPrice;
    this.accountBalance.availableCash += revenue;
    // Adjust allocated cash based on the original entry price for simplicity.
    this.accountBalance.allocatedCash -= position.entryPrice * quantityToSell;
    await this.updatePortfolioValue();
    if (position.quantity === 0) {
      this.positions.delete(tokenMint);
      return null;
    }
    return position;
  }

  /**
   * Updates the current market price for a given token position.
   * @param tokenMint - Token address.
   */
  public async updatePositionPrice(tokenMint: string): Promise<void> {
    const position = this.positions.get(tokenMint);
    if (!position) {
      return;
    }
    const currentPrice = await this.fetchTokenPrice(tokenMint);
    // Optionally, recalculate profit/loss here.
    // For example:
    // const pnl = (currentPrice - position.entryPrice) * position.quantity;
    // console.log(`P&L for ${position.tokenSymbol}: $${pnl.toFixed(2)}`);
  }

  /**
   * Updates the portfolio's total value by summing available cash and the market value of open positions.
   */
  public async updatePortfolioValue(): Promise<void> {
    let totalPositionsValue = 0;
    for (const position of this.positions.values()) {
      const currentPrice = await this.fetchTokenPrice(position.tokenMint);
      totalPositionsValue += currentPrice * position.quantity;
    }
    this.accountBalance.totalValue = this.accountBalance.availableCash + totalPositionsValue;
  }

  /**
   * Synchronously updates the total value based on available and allocated cash.
   * (For immediate updates without current prices.)
   */
  private updateTotalValue(): void {
    this.accountBalance.totalValue = this.accountBalance.availableCash + this.accountBalance.allocatedCash;
  }
}
