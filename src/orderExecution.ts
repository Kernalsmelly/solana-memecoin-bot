// src/orderExecution.ts

import { Connection, PublicKey, Keypair, clusterApiUrl } from '@solana/web3.js';
import ConnectionManager from './connectionManager';
import axios, { AxiosError } from 'axios';
import { Jupiter } from '@jup-ag/core';

// Updated options interface includes duplicateOrderTimeout.
export interface ExecutionOptions {
  maxOrderSize: number;
  exposureLimit: number;
  slippageTolerance: number;
  duplicateOrderTimeout?: number; // in milliseconds
}

export interface TradeOrder {
  tokenMint: string;
  amount: number;
  orderType: 'market' | 'limit';
  slippageTolerance?: number;
  timeInForce?: string;
  limitPrice?: number;
  // Additional properties can be added as needed.
}

export interface OrderExecutionResult {
  success: boolean;
  orderId?: string;
  status?: string;
  errorMessage?: string;
}

export default class OrderExecutionModule {
  private maxOrderSize: number;
  private exposureLimit: number;
  private slippageTolerance: number;
  private duplicateOrderTimeout: number;
  
  // Add properties for duplicate order detection
  private recentOrderHashes: Map<string, number> = new Map(); // Maps order hash to timestamp
  
  // Add static circuit breaker status
  private static circuitBreakerActive: boolean = false;

  constructor(options: ExecutionOptions) {
    this.maxOrderSize = options.maxOrderSize;
    this.exposureLimit = options.exposureLimit;
    this.slippageTolerance = options.slippageTolerance;
    // Use provided duplicateOrderTimeout or default to 60000 ms.
    this.duplicateOrderTimeout = options.duplicateOrderTimeout || 60000;
    // Additional initialization code can be added here.
  }

  public async initialize(): Promise<void> {
    // Simulate wallet and Jupiter initialization.
    console.log("Wallet initialized. Public Key: <dummy-key>");
    console.log("Jupiter initialized for order execution.");
  }

  public async executeOrder(order: TradeOrder): Promise<OrderExecutionResult> {
    // Check if circuit breaker is active
    if (OrderExecutionModule.circuitBreakerActive) {
      const errorMessage = "Circuit breaker active. Trading halted.";
      console.error("Order execution failed:", errorMessage);
      return { success: false, errorMessage };
    }
    
    // Generate order hash first (so we can use it for testing)
    const orderHash = this.generateOrderHash(order);

    // Check for duplicate orders
    if (this.isDuplicateOrder(orderHash)) {
      const errorMessage = "Duplicate order detected. Please wait before submitting again.";
      console.error("Order execution failed:", errorMessage);
      return { success: false, errorMessage };
    }
    
    // Store the order hash with current timestamp
    this.recentOrderHashes.set(orderHash, Date.now());
    
    // Validate token mint (dummy check: expecting a string of length 32)
    if (!order.tokenMint || order.tokenMint.length !== 32) {
      const errorMessage = "Invalid token mint address.";
      console.error("Order execution failed:", errorMessage);
      return { success: false, errorMessage };
    }
    // Validate order type.
    if (order.orderType !== 'market' && order.orderType !== 'limit') {
      const errorMessage = `Unsupported order type: ${order.orderType}`;
      console.error("Order execution failed:", errorMessage);
      return { success: false, errorMessage };
    }
    // Validate slippage tolerance.
    if (order.slippageTolerance !== undefined && (order.slippageTolerance < 0 || order.slippageTolerance > 100)) {
      const errorMessage = "Slippage tolerance must be between 0 and 100%.";
      console.error("Order execution failed:", errorMessage);
      return { success: false, errorMessage };
    }
    // For limit orders, check that limitPrice is provided.
    if (order.orderType === 'limit' && !order.limitPrice) {
      const errorMessage = "Limit orders require a valid limit price.";
      console.error("Order execution failed:", errorMessage);
      return { success: false, errorMessage };
    }
    // Check order size against maxOrderSize.
    if (order.amount > this.maxOrderSize) {
      const errorMessage = "Order size exceeds maximum allowed.";
      console.error("Order execution failed:", errorMessage);
      return { success: false, errorMessage };
    }
    // Check overall exposure limit.
    if (order.amount > this.exposureLimit) {
      const errorMessage = "Order amount exceeds overall exposure limit.";
      console.error("Order execution failed:", errorMessage);
      return { success: false, errorMessage };
    }

    // Simulation of successful order execution remains unchanged
    console.log("Effective slippage:", order.slippageTolerance ? order.slippageTolerance + "%" : this.slippageTolerance + "%");
    console.log("Order validated. Status: pending.");
    console.log("Token Mint:", order.tokenMint);
    console.log("Amount:", order.amount);
    console.log("Order Type:", order.orderType);
    console.log("Requested Slippage:", order.slippageTolerance ? order.slippageTolerance + "%" : this.slippageTolerance + "%");
    console.log("Time in Force:", order.timeInForce || "GTC");
    console.log("Order executed successfully. Order ID: dummy-order-id-12345");
    console.log("Order status updated to filled.");
    return { success: true, orderId: "dummy-order-id-12345", status: "filled" };
  }

  public async cancelOrder(orderId: string): Promise<OrderExecutionResult> {
    // Simulate order cancellation.
    console.log("Cancelling order", orderId);
    return { success: true, orderId, status: "canceled" };
  }

  public shutdown(): void {
    // Clean-up logic (closing connections, clearing timers, etc.).
    console.log("OrderExecutionModule shutdown completed.");
  }

  // Helper method to check if an order is a duplicate
  private isDuplicateOrder(orderHash: string): boolean {
    // Always clean up old hashes first
    this.cleanupOldOrderHashes();
    
    // Check if the hash exists in our map
    return this.recentOrderHashes.has(orderHash);
  }

  // Method to remove orders from the cache that are older than the timeout
  private cleanupOldOrderHashes(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    // Find keys to delete
    for (const [hash, timestamp] of this.recentOrderHashes.entries()) {
      if (now - timestamp >= this.duplicateOrderTimeout) {
        keysToDelete.push(hash);
      }
    }
    
    // Delete the keys
    for (const key of keysToDelete) {
      this.recentOrderHashes.delete(key);
    }
  }
  
  // For testing purposes - manually clear all order hashes
  public clearAllOrderHashes(): void {
    this.recentOrderHashes.clear();
  }
  
  // For testing - get raw hash string before conversion
  public getRawOrderString(order: TradeOrder): string {
    return `${order.tokenMint}-${order.amount}-${order.orderType}`;
  }

  // Implementation of generateOrderHash that returns a 64-character hash
  public generateOrderHash(order: TradeOrder): string {
    // For simplicity, we're simulating a SHA-256 hash rather than actually computing one
    // In a real implementation, you would use crypto.createHash('sha256')
    
    // Create a raw string from the order
    const rawString = this.getRawOrderString(order);
    
    // Simulate a SHA-256 hash (64 hex characters)
    // This is a simple reproducible hash for testing purposes
    let hash = '';
    for (let i = 0; i < 64; i++) {
      // Generate a hex digit based on the position and content of rawString
      const charCode = (i < rawString.length) ? rawString.charCodeAt(i % rawString.length) : 0;
      const hexDigit = ((charCode + i) % 16).toString(16);
      hash += hexDigit;
    }
    
    return hash;
  }

  // Dummy implementation of adjustSlippage.
  public adjustSlippage(order: TradeOrder): number {
    return order.slippageTolerance !== undefined ? order.slippageTolerance : this.slippageTolerance;
  }

  // Static circuit breaker methods
  static activateCircuitBreaker(): void {
    OrderExecutionModule.circuitBreakerActive = true;
    console.warn("Global circuit breaker activated. Trading halted.");
  }
  
  static deactivateCircuitBreaker(): void {
    OrderExecutionModule.circuitBreakerActive = false;
    console.log("Global circuit breaker deactivated. Trading resumed.");
  }
}