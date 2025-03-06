// src/tradingSystem.ts

import OrderExecutionModule, { TradeOrder, OrderExecutionResult } from './orderExecution';
import ContractValidator, { RugAnalysis, RiskLevel } from './contractValidator';
import TokenMonitor from './tokenMonitor';
import { PositionManager, Position, AccountBalance } from './positionManager';
import { PersistenceManager, TradingState, TradeHistoryEntry } from './persistenceManager';
import { EventEmitter } from 'events';

/**
 * Configuration for the trading system.
 */
export interface TradingSystemConfig {
  initialBalance: number;       // Starting capital in USD
  maxPositionSize: number;      // Maximum size per position in USD
  maxRisk: RiskLevel;           // Maximum acceptable contract risk level
  autoSave: boolean;            // Whether to auto-save after trades
  dataDirectory: string;        // Directory to store trading data
  slippageTolerance: number;    // Default slippage tolerance percentage
}

/**
 * Defines events emitted by the trading system.
 */
export interface TradingSystemEvents {
  initialized: { portfolio: AccountBalance; positions: Position[] };
  stateSaved: { timestamp: number };
  buy: { tokenMint: string; tokenSymbol: string; amount: number; quantity: number; price: number; position: Position };
  sell: { tokenMint: string; percentOfPosition: number; quantitySold: number; price: number; updatedPosition: Position | null };
  priceUpdate: { tokenMint: string; price: number; position: Position | null; portfolio: AccountBalance };
  volumeSpike: { tokenMint: string; volume: number };
  error: { message: string; error: Error; tokenMint?: string };
}

/**
 * Main trading system that coordinates all components.
 */
export class TradingSystem extends EventEmitter {
  private orderExecution: OrderExecutionModule;
  private contractValidator: ContractValidator;
  private tokenMonitor: TokenMonitor;
  private positionManager: PositionManager;
  private persistenceManager: PersistenceManager;
  private config: TradingSystemConfig;
  private isInitialized: boolean = false;
  private isShuttingDown: boolean = false;
  
  /**
   * Create a new trading system.
   * @param config - Configuration options for the trading system.
   */
  constructor(config: TradingSystemConfig) {
    super();
    this.config = config;
    
    // Initialize component modules with configuration.
    this.orderExecution = new OrderExecutionModule({
      maxOrderSize: config.maxPositionSize,
      exposureLimit: config.initialBalance,
      slippageTolerance: config.slippageTolerance,
      // duplicateOrderTimeout is optional; the module sets a default if not provided.
    });
    
    this.contractValidator = new ContractValidator();
    this.tokenMonitor = new TokenMonitor();
    this.positionManager = new PositionManager(config.initialBalance);
    this.persistenceManager = new PersistenceManager(config.dataDirectory);
  }
  
  /**
   * Initialize the trading system and load previous state if available.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      await this.orderExecution.initialize();
      this.setupEventHandlers();
      await this.loadState();
      await this.positionManager.updatePortfolioValue();
      
      this.isInitialized = true;
      this.emit('initialized', {
        portfolio: this.positionManager.getAccountBalance(),
        positions: this.positionManager.getAllPositions()
      });
      
      console.log('Trading system initialized successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to initialize trading system: ${err.message}`);
      this.emit('error', { message: 'Initialization failed', error: err });
      throw err;
    }
  }
  
  /**
   * Set up event handlers for component modules.
   */
  private setupEventHandlers(): void {
    this.tokenMonitor.on('priceUpdate', this.handlePriceUpdate.bind(this));
    this.tokenMonitor.on('volumeSpike', this.handleVolumeSpike.bind(this));
    
    process.on('uncaughtException', this.handleUncaughtError.bind(this));
    process.on('unhandledRejection', this.handleUncaughtError.bind(this));
    
    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down gracefully...');
      await this.shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await this.shutdown();
      process.exit(0);
    });
  }
  
  /**
   * Handle uncaught errors.
   */
  private handleUncaughtError(error: Error): void {
    console.error('Uncaught error in trading system:', error);
    this.emit('error', { message: 'Uncaught error', error });
    
    if (this.isInitialized && !this.isShuttingDown) {
      console.log('Attempting to save state before potential crash...');
      this.saveState().catch(err => console.error('Failed to save state during error handling:', err));
    }
  }
  
  /**
   * Load previous trading state if available.
   */
  private async loadState(): Promise<void> {
    try {
      const state = await this.persistenceManager.loadState();
      if (state) {
        const newPositionManager = new PositionManager(state.accountBalance.availableCash + state.accountBalance.allocatedCash);
        for (const position of state.positions) {
          await newPositionManager.openPosition(
            position.tokenMint,
            position.tokenSymbol,
            position.tokenDecimals,
            position.quantity,
            position.entryPrice
          );
        }
        this.positionManager = newPositionManager;
        console.log(`Previous trading state loaded with ${state.positions.length} positions`);
      } else {
        console.log('No previous trading state found, starting fresh');
      }
    } catch (error) {
      console.warn(`Failed to load previous state, starting fresh: ${error}`);
    }
  }
  
  /**
   * Save current trading state.
   */
  public async saveState(): Promise<void> {
    if (!this.isInitialized) throw new Error('Cannot save state before initialization');
    
    try {
      const positions = this.positionManager.getAllPositions();
      const accountBalance = this.positionManager.getAccountBalance();
      const tradeHistory: TradeHistoryEntry[] = [];
      
      for (const position of positions) {
        for (const trade of position.trades) {
          tradeHistory.push({ ...trade, positionId: position.tokenMint, balanceAfterTrade: accountBalance.totalValue });
        }
      }
      
      tradeHistory.sort((a, b) => a.timestamp - b.timestamp);
      
      const state: TradingState = {
        positions,
        accountBalance,
        tradeHistory,
        lastUpdated: Date.now()
      };
      
      await this.persistenceManager.saveState(state);
      this.emit('stateSaved', { timestamp: Date.now() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to save trading state: ${err.message}`);
      this.emit('error', { message: 'Failed to save state', error: err });
      throw err;
    }
  }
  
  /**
   * Validate a token contract before trading.
   */
  public async validateToken(tokenMint: string): Promise<RugAnalysis> {
    this.ensureInitialized();
    
    try {
      const analysis = await this.contractValidator.validateContract(tokenMint);
      if (analysis.risk > this.config.maxRisk) {
        console.warn(`Token ${tokenMint} has risk level ${analysis.risk}, which exceeds max allowed risk ${this.config.maxRisk}`);
      }
      return analysis;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Failed to validate token ${tokenMint}: ${err.message}`);
      this.emit('error', { message: `Token validation failed for ${tokenMint}`, error: err, tokenMint });
      throw err;
    }
  }
  
  /**
   * Buy a token.
   */
  public async buyToken(
    tokenMint: string,
    tokenSymbol: string,
    tokenDecimals: number,
    amount: number,
    slippageTolerance?: number
  ): Promise<Position> {
    this.ensureInitialized();
    
    try {
      const analysis = await this.validateToken(tokenMint);
      if (analysis.risk > this.config.maxRisk) {
        throw new Error(`Token risk level ${analysis.risk} exceeds maximum allowed risk ${this.config.maxRisk}`);
      }
      if (amount > this.config.maxPositionSize) {
        throw new Error(`Order size $${amount} exceeds maximum position size $${this.config.maxPositionSize}`);
      }
      
      const price = await this.positionManager.getTokenPrice(tokenMint);
      const quantity = amount / price;
      const accountBalance = this.positionManager.getAccountBalance();
      if (amount > accountBalance.availableCash) {
        throw new Error(`Insufficient funds: Required $${amount}, Available $${accountBalance.availableCash.toFixed(2)}`);
      }
      
      this.tokenMonitor.subscribeToToken(tokenMint);
      
      const order: TradeOrder = {
        tokenMint,
        amount: quantity,
        orderType: 'market',
        slippageTolerance: slippageTolerance || this.config.slippageTolerance,
      };
      
      const result = await this.orderExecution.executeOrder(order);
      if (!result.success) throw new Error(`Order execution failed: ${result.errorMessage}`);
      
      const position = await this.positionManager.openPosition(tokenMint, tokenSymbol, tokenDecimals, quantity, price);
      
      if (this.config.autoSave) await this.saveState();
      
      this.emit('buy', { tokenMint, tokenSymbol, amount, quantity, price, position });
      console.log(`Bought ${quantity.toFixed(tokenDecimals)} ${tokenSymbol} at $${price.toFixed(2)}`);
      return position;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Buy order failed for ${tokenMint}: ${err.message}`);
      this.emit('error', { message: 'Buy order failed', error: err, tokenMint });
      throw err;
    }
  }
  
  /**
   * Sell a token.
   */
  public async sellToken(
    tokenMint: string,
    percentOfPosition: number = 100,
    slippageTolerance?: number
  ): Promise<Position | null> {
    this.ensureInitialized();
    
    try {
      if (percentOfPosition <= 0 || percentOfPosition > 100) {
        throw new Error('Percentage must be between 1 and 100');
      }
      
      const position = this.positionManager.getPosition(tokenMint);
      if (!position) throw new Error(`No position found for token ${tokenMint}`);
      
      const quantityToSell = position.quantity * (percentOfPosition / 100);
      const price = await this.positionManager.getTokenPrice(tokenMint);
      
      const order: TradeOrder = {
        tokenMint,
        amount: quantityToSell,
        orderType: 'market',
        slippageTolerance: slippageTolerance || this.config.slippageTolerance,
      };
      
      const result = await this.orderExecution.executeOrder(order);
      if (!result.success) throw new Error(`Sell order execution failed: ${result.errorMessage}`);
      
      const updatedPosition = await this.positionManager.closePosition(tokenMint, quantityToSell, price);
      if (this.config.autoSave) await this.saveState();
      if (percentOfPosition === 100) this.tokenMonitor.unsubscribeFromToken(tokenMint);
      
      this.emit('sell', { tokenMint, percentOfPosition, quantitySold: quantityToSell, price, updatedPosition });
      const symbolText = position.tokenSymbol || tokenMint.substring(0, 6) + '...';
      console.log(`Sold ${quantityToSell.toFixed(position.tokenDecimals)} ${symbolText} (${percentOfPosition}% of position) at $${price.toFixed(2)}`);
      return updatedPosition;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Sell order failed for ${tokenMint}: ${err.message}`);
      this.emit('error', { message: 'Sell order failed', error: err, tokenMint });
      throw err;
    }
  }
  
  /**
   * Handle price updates from token monitor.
   */
  private async handlePriceUpdate(data: { tokenMint: string; price: number }): Promise<void> {
    const { tokenMint, price } = data;
    try {
      const position = this.positionManager.getPosition(tokenMint);
      if (position) {
        await this.positionManager.updatePositionPrice(tokenMint);
        await this.positionManager.updatePortfolioValue();
        this.emit('priceUpdate', {
          tokenMint,
          price,
          position: this.positionManager.getPosition(tokenMint),
          portfolio: this.positionManager.getAccountBalance()
        });
      }
    } catch (error) {
      console.error(`Error processing price update for ${tokenMint}:`, error);
    }
  }
  
  /**
   * Handle volume spike events from token monitor.
   */
  private handleVolumeSpike(data: { tokenMint: string; volume: number }): void {
    this.emit('volumeSpike', data);
    console.log(`Volume spike detected for ${data.tokenMint}: ${data.volume}`);
  }
  
  /**
   * Get all current positions.
   */
  public getPositions(): Position[] {
    this.ensureInitialized();
    return this.positionManager.getAllPositions();
  }
  
  /**
   * Get a specific position by token mint.
   */
  public getPosition(tokenMint: string): Position | null {
    this.ensureInitialized();
    return this.positionManager.getPosition(tokenMint);
  }
  
  /**
   * Get overall portfolio balance and information.
   */
  public getPortfolio(): AccountBalance {
    this.ensureInitialized();
    return this.positionManager.getAccountBalance();
  }
  
  /**
   * Update all positions with current market prices.
   */
  public async updateAllPositions(): Promise<void> {
    this.ensureInitialized();
    await this.positionManager.updatePortfolioValue();
  }
  
  /**
   * Shut down the trading system gracefully.
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    try {
      console.log('Shutting down trading system...');
      if (this.isInitialized) {
        await this.saveState();
        console.log('Final state saved');
      }
      await this.persistenceManager.createBackup();
      console.log('State backup created');
      this.orderExecution.shutdown();
      for (const position of this.positionManager.getAllPositions()) {
        this.tokenMonitor.unsubscribeFromToken(position.tokenMint);
      }
      this.removeAllListeners();
      process.off('uncaughtException', this.handleUncaughtError);
      process.off('unhandledRejection', this.handleUncaughtError);
      this.isInitialized = false;
      console.log('Trading system shut down complete');
    } catch (error) {
      console.error(`Error during shutdown: ${error}`);
    } finally {
      this.isShuttingDown = false;
    }
  }
  
  /**
   * Export trade history to CSV.
   */
  public async exportTradeHistory(outputFile: string): Promise<string> {
    this.ensureInitialized();
    return this.persistenceManager.exportTradeHistoryToCsv(outputFile);
  }
  
  /**
   * Create a backup of the current state.
   */
  public async createBackup(): Promise<string> {
    this.ensureInitialized();
    return this.persistenceManager.createBackup();
  }
  
  /**
   * Subscribe to price updates for a token.
   */
  public subscribeToToken(tokenMint: string): void {
    this.ensureInitialized();
    this.tokenMonitor.subscribeToToken(tokenMint);
  }
  
  /**
   * Unsubscribe from price updates for a token.
   */
  public unsubscribeFromToken(tokenMint: string): void {
    this.ensureInitialized();
    this.tokenMonitor.unsubscribeFromToken(tokenMint);
  }
  
  /**
   * Ensure the trading system is initialized.
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Trading system must be initialized before use. Call initialize() first.');
    }
  }
}
