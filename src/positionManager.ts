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
   * Closes (or partially closes) a position.
   * @param tokenMint - Token address.
   * @param quantityToSell - Quantity to sell.
   * @param sellPrice - Price at which the token is sold.
   * @returns The updated position or null if fully closed.
   */
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
