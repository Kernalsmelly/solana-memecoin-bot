"use strict";
// src/tradingSystem.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingSystem = void 0;
const orderExecution_1 = __importDefault(require("./orderExecution"));
const contractValidator_1 = __importDefault(require("./contractValidator"));
const tokenMonitor_1 = __importDefault(require("./tokenMonitor"));
const positionManager_1 = require("./positionManager");
const persistenceManager_1 = require("./persistenceManager");
const events_1 = require("events");
/**
 * Main trading system that coordinates all components.
 */
class TradingSystem extends events_1.EventEmitter {
    /**
     * Create a new trading system.
     * @param config - Configuration options for the trading system.
     */
    constructor(config) {
        super();
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.config = config;
        // Initialize component modules with configuration.
        this.orderExecution = new orderExecution_1.default({
            maxOrderSize: config.maxPositionSize,
            exposureLimit: config.initialBalance,
            slippageTolerance: config.slippageTolerance,
            // duplicateOrderTimeout is optional; the module sets a default if not provided.
        });
        this.contractValidator = new contractValidator_1.default();
        this.tokenMonitor = new tokenMonitor_1.default();
        this.positionManager = new positionManager_1.PositionManager(config.initialBalance);
        this.persistenceManager = new persistenceManager_1.PersistenceManager(config.dataDirectory);
    }
    /**
     * Initialize the trading system and load previous state if available.
     */
    async initialize() {
        if (this.isInitialized)
            return;
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
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`Failed to initialize trading system: ${err.message}`);
            this.emit('error', { message: 'Initialization failed', error: err });
            throw err;
        }
    }
    /**
     * Set up event handlers for component modules.
     */
    setupEventHandlers() {
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
    handleUncaughtError(error) {
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
    async loadState() {
        try {
            const state = await this.persistenceManager.loadState();
            if (state) {
                const newPositionManager = new positionManager_1.PositionManager(state.accountBalance.availableCash + state.accountBalance.allocatedCash);
                for (const position of state.positions) {
                    await newPositionManager.openPosition(position.tokenMint, position.tokenSymbol, position.tokenDecimals, position.quantity, position.entryPrice);
                }
                this.positionManager = newPositionManager;
                console.log(`Previous trading state loaded with ${state.positions.length} positions`);
            }
            else {
                console.log('No previous trading state found, starting fresh');
            }
        }
        catch (error) {
            console.warn(`Failed to load previous state, starting fresh: ${error}`);
        }
    }
    /**
     * Save current trading state.
     */
    async saveState() {
        if (!this.isInitialized)
            throw new Error('Cannot save state before initialization');
        try {
            const positions = this.positionManager.getAllPositions();
            const accountBalance = this.positionManager.getAccountBalance();
            const tradeHistory = [];
            for (const position of positions) {
                for (const trade of position.trades) {
                    tradeHistory.push({ ...trade, positionId: position.tokenMint, balanceAfterTrade: accountBalance.totalValue });
                }
            }
            tradeHistory.sort((a, b) => a.timestamp - b.timestamp);
            const state = {
                positions,
                accountBalance,
                tradeHistory,
                lastUpdated: Date.now()
            };
            await this.persistenceManager.saveState(state);
            this.emit('stateSaved', { timestamp: Date.now() });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`Failed to save trading state: ${err.message}`);
            this.emit('error', { message: 'Failed to save state', error: err });
            throw err;
        }
    }
    /**
     * Validate a token contract before trading.
     */
    async validateToken(tokenMint) {
        this.ensureInitialized();
        try {
            const analysis = await this.contractValidator.validateContract(tokenMint);
            if (analysis.risk > this.config.maxRisk) {
                console.warn(`Token ${tokenMint} has risk level ${analysis.risk}, which exceeds max allowed risk ${this.config.maxRisk}`);
            }
            return analysis;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`Failed to validate token ${tokenMint}: ${err.message}`);
            this.emit('error', { message: `Token validation failed for ${tokenMint}`, error: err, tokenMint });
            throw err;
        }
    }
    /**
     * Buy a token.
     */
    async buyToken(tokenMint, tokenSymbol, tokenDecimals, amount, slippageTolerance) {
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
            const order = {
                tokenMint,
                amount: quantity,
                orderType: 'market',
                slippageTolerance: slippageTolerance || this.config.slippageTolerance,
            };
            const result = await this.orderExecution.executeOrder(order);
            if (!result.success)
                throw new Error(`Order execution failed: ${result.errorMessage}`);
            const position = await this.positionManager.openPosition(tokenMint, tokenSymbol, tokenDecimals, quantity, price);
            if (this.config.autoSave)
                await this.saveState();
            this.emit('buy', { tokenMint, tokenSymbol, amount, quantity, price, position });
            console.log(`Bought ${quantity.toFixed(tokenDecimals)} ${tokenSymbol} at $${price.toFixed(2)}`);
            return position;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`Buy order failed for ${tokenMint}: ${err.message}`);
            this.emit('error', { message: 'Buy order failed', error: err, tokenMint });
            throw err;
        }
    }
    /**
     * Sell a token.
     */
    async sellToken(tokenMint, percentOfPosition = 100, slippageTolerance) {
        this.ensureInitialized();
        try {
            if (percentOfPosition <= 0 || percentOfPosition > 100) {
                throw new Error('Percentage must be between 1 and 100');
            }
            const position = this.positionManager.getPosition(tokenMint);
            if (!position)
                throw new Error(`No position found for token ${tokenMint}`);
            const quantityToSell = position.quantity * (percentOfPosition / 100);
            const price = await this.positionManager.getTokenPrice(tokenMint);
            const order = {
                tokenMint,
                amount: quantityToSell,
                orderType: 'market',
                slippageTolerance: slippageTolerance || this.config.slippageTolerance,
            };
            const result = await this.orderExecution.executeOrder(order);
            if (!result.success)
                throw new Error(`Sell order execution failed: ${result.errorMessage}`);
            const updatedPosition = await this.positionManager.closePosition(tokenMint, quantityToSell, price);
            if (this.config.autoSave)
                await this.saveState();
            if (percentOfPosition === 100)
                this.tokenMonitor.unsubscribeFromToken(tokenMint);
            this.emit('sell', { tokenMint, percentOfPosition, quantitySold: quantityToSell, price, updatedPosition });
            const symbolText = position.tokenSymbol || tokenMint.substring(0, 6) + '...';
            console.log(`Sold ${quantityToSell.toFixed(position.tokenDecimals)} ${symbolText} (${percentOfPosition}% of position) at $${price.toFixed(2)}`);
            return updatedPosition;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`Sell order failed for ${tokenMint}: ${err.message}`);
            this.emit('error', { message: 'Sell order failed', error: err, tokenMint });
            throw err;
        }
    }
    /**
     * Handle price updates from token monitor.
     */
    async handlePriceUpdate(data) {
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
        }
        catch (error) {
            console.error(`Error processing price update for ${tokenMint}:`, error);
        }
    }
    /**
     * Handle volume spike events from token monitor.
     */
    handleVolumeSpike(data) {
        this.emit('volumeSpike', data);
        console.log(`Volume spike detected for ${data.tokenMint}: ${data.volume}`);
    }
    /**
     * Get all current positions.
     */
    getPositions() {
        this.ensureInitialized();
        return this.positionManager.getAllPositions();
    }
    /**
     * Get a specific position by token mint.
     */
    getPosition(tokenMint) {
        this.ensureInitialized();
        return this.positionManager.getPosition(tokenMint);
    }
    /**
     * Get overall portfolio balance and information.
     */
    getPortfolio() {
        this.ensureInitialized();
        return this.positionManager.getAccountBalance();
    }
    /**
     * Update all positions with current market prices.
     */
    async updateAllPositions() {
        this.ensureInitialized();
        await this.positionManager.updatePortfolioValue();
    }
    /**
     * Shut down the trading system gracefully.
     */
    async shutdown() {
        if (this.isShuttingDown)
            return;
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
        }
        catch (error) {
            console.error(`Error during shutdown: ${error}`);
        }
        finally {
            this.isShuttingDown = false;
        }
    }
    /**
     * Export trade history to CSV.
     */
    async exportTradeHistory(outputFile) {
        this.ensureInitialized();
        return this.persistenceManager.exportTradeHistoryToCsv(outputFile);
    }
    /**
     * Create a backup of the current state.
     */
    async createBackup() {
        this.ensureInitialized();
        return this.persistenceManager.createBackup();
    }
    /**
     * Subscribe to price updates for a token.
     */
    subscribeToToken(tokenMint) {
        this.ensureInitialized();
        this.tokenMonitor.subscribeToToken(tokenMint);
    }
    /**
     * Unsubscribe from price updates for a token.
     */
    unsubscribeFromToken(tokenMint) {
        this.ensureInitialized();
        this.tokenMonitor.unsubscribeFromToken(tokenMint);
    }
    /**
     * Ensure the trading system is initialized.
     */
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Trading system must be initialized before use. Call initialize() first.');
        }
    }
}
exports.TradingSystem = TradingSystem;
