"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingSystem = void 0;
// src/tradingSystem.ts
const web3_js_1 = require("@solana/web3.js");
const orderExecution_1 = require("./orderExecution");
const web3_js_2 = require("@solana/web3.js");
const contractValidator_1 = require("./contractValidator");
const tokenMonitor_1 = require("./tokenMonitor");
const persistenceManager_1 = require("./persistenceManager");
const logger_1 = __importDefault(require("./utils/logger"));
const StrategyCoordinator_1 = require("./strategy/StrategyCoordinator");
const momentumBreakout_1 = require("./strategies/momentumBreakout");
const volatilitySqueeze_1 = require("./strategies/volatilitySqueeze");
class TradingSystem {
    strategyCoordinator;
    latestPatterns = new Map();
    connection;
    orderExecution;
    contractValidator;
    tokenMonitor;
    persistenceManager;
    // private state: any; // Removed TradingState
    constructor(connection) {
        // Register both MomentumBreakoutStrategy and VolatilitySqueeze for pilot
        const momentumBreakout = new momentumBreakout_1.MomentumBreakoutStrategy({ cooldownSec: 300 });
        const squeeze = new volatilitySqueeze_1.VolatilitySqueeze({ priceChangeThreshold: 20, volumeMultiplier: 2 });
        this.strategyCoordinator = new StrategyCoordinator_1.StrategyCoordinator({
            strategies: [momentumBreakout, squeeze],
            enabledStrategies: ['momentumBreakout', 'volatilitySqueeze'],
            cooldownSec: 300
        });
        this.strategyCoordinator.on('tokenDispatch', async (tokenAddress) => {
            const pattern = this.latestPatterns.get(tokenAddress);
            if (pattern) {
                logger_1.default.info(`[Coordinator] Dispatching trade for ${tokenAddress}`);
                try {
                    if (this.canOpenPosition()) {
                        await this.executeSignal({
                            tokenAddress: pattern.tokenAddress,
                            price: pattern.metrics.price,
                            stopLoss: pattern.metrics.price * 0.95,
                            positionSize: this.calculatePositionSize(pattern.metrics.liquidity),
                            confidence: pattern.confidence,
                            timestamp: Date.now(),
                            timeframe: '1h',
                            signalType: 'buy'
                        });
                    }
                    else {
                        logger_1.default.info(`[Coordinator] Cannot open position, skipping trade for ${tokenAddress}`);
                    }
                }
                catch (e) {
                    logger_1.default.error(`[Coordinator] Error dispatching trade for ${tokenAddress}:`, e);
                }
                // Always mark token as complete after trade attempt
                this.strategyCoordinator.completeToken(tokenAddress);
            }
            else {
                logger_1.default.warn(`[Coordinator] No pattern found for dispatched token ${tokenAddress}`);
                this.strategyCoordinator.completeToken(tokenAddress);
            }
        });
        this.connection = connection;
        this.orderExecution = new orderExecution_1.LiveOrderExecution(connection, web3_js_2.Keypair.generate());
        this.contractValidator = (0, contractValidator_1.createContractValidator)(connection);
        this.tokenMonitor = new tokenMonitor_1.TokenMonitor();
        this.persistenceManager = new persistenceManager_1.PersistenceManager();
        // this.state = this.persistenceManager.loadState(); // Removed TradingState
        this.setupEventListeners();
    }
    setupEventListeners() {
        this.tokenMonitor.on('newToken', this.handleNewToken.bind(this));
        this.tokenMonitor.on('tokenUpdate', this.handleTokenUpdate.bind(this));
        this.tokenMonitor.on('patternDetected', this.handlePatternDetected.bind(this));
        this.tokenMonitor.on('error', this.handleError.bind(this));
    }
    async handleNewToken(metrics) {
        try {
            // Validate contract
            const analysis = await this.contractValidator.validateContract(metrics.address);
            // Skip if high risk
            if (analysis.riskLevel === 'high') {
                logger_1.default.info('Skipping high risk token', { address: metrics.address, issues: analysis.issues });
                return;
            }
            // Add to monitor
            await this.tokenMonitor.addToken(metrics);
        }
        catch (error) {
            logger_1.default.error('Error handling new token:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    async handleTokenUpdate(metrics) {
        try {
            // Update token metrics
            await this.tokenMonitor.updateToken(metrics);
            // Check positions
            const position = this.getPosition(metrics.address);
            if (position) {
                await this.updatePosition(position, metrics.price);
            }
        }
        catch (error) {
            logger_1.default.error('Error handling token update:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    async handlePatternDetected(pattern) {
        try {
            // Store the pattern for later dispatch
            this.latestPatterns.set(pattern.tokenAddress, pattern);
            // Enqueue the token for concurrency/cooldown-controlled trading
            this.strategyCoordinator.enqueueToken(pattern.tokenAddress);
        }
        catch (error) {
            logger_1.default.error('[DEBUG] Error handling pattern:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    handleError(error) {
        logger_1.default.error('Trading system error:', error.message);
    }
    async executeSignal(signal) {
        try {
            const order = {
                tokenAddress: signal.tokenAddress,
                side: 'buy',
                size: signal.positionSize,
                price: signal.price
            };
            const result = await this.orderExecution.executeOrder(order);
            if (result.success) {
                const position = {
                    id: `${signal.tokenAddress}-${Date.now()}`, // Add unique ID
                    tokenAddress: signal.tokenAddress,
                    tokenSymbol: 'UNKNOWN', // Will be updated later
                    tokenMint: new web3_js_1.PublicKey(signal.tokenAddress), // Fixed PublicKey type issue
                    tokenDecimals: 9,
                    quantity: signal.positionSize / signal.price,
                    entryPrice: signal.price,
                    currentPrice: signal.price,
                    size: signal.positionSize,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.price * 1.5, // 50% take profit
                    pnl: 0,
                    status: 'open',
                    timestamp: Date.now()
                };
                this.persistenceManager.savePosition(position);
                this.updateRiskMetrics();
            }
        }
        catch (error) {
            logger_1.default.error('Error executing signal:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    calculatePositionSize(liquidity) {
        const maxSize = Math.min(1000 * 0.1, // Stub: Max 10% of balance
        liquidity * 0.02 // Max 2% of liquidity
        );
        return Math.min(maxSize, 1000); // Hard cap at $1000
    }
    canOpenPosition() {
        return true; // Stub: Always allow opening positions
    }
    async updatePosition(position, currentPrice) {
        try {
            position.currentPrice = currentPrice;
            position.pnl = (currentPrice - position.entryPrice) * position.quantity;
            // Check stop loss
            if (currentPrice <= position.stopLoss) {
                await this.closePosition(position, 'Stop loss hit');
                return;
            }
            // Check take profit
            if (currentPrice >= position.takeProfit) {
                await this.closePosition(position, 'Take profit hit');
                return;
            }
            this.persistenceManager.savePosition(position);
        }
        catch (error) {
            logger_1.default.error('Error updating position:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    async closePosition(position, reason) {
        try {
            const order = {
                tokenAddress: position.tokenAddress,
                side: 'sell',
                size: position.size,
                price: position.currentPrice
            };
            const result = await this.orderExecution.executeOrder(order);
            if (result.success) {
                position.status = 'closed';
                this.persistenceManager.savePosition(position);
                this.updateRiskMetrics();
                logger_1.default.info('Position closed', {
                    tokenAddress: position.tokenAddress,
                    reason,
                    pnl: position.pnl
                });
            }
        }
        catch (error) {
            logger_1.default.error('Error closing position:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    updateRiskMetrics() {
        const positions = []; // Stub: No state.positions
        const activePositions = [];
        const totalPnL = 0;
        const metrics = {
            currentBalance: 0,
            dailyPnL: 0,
            drawdown: 0,
            winRate: 0,
            activePositions: 0,
            availablePositions: 3,
            highWaterMark: 0,
            dailyLoss: 0
        };
        // Persist risk metrics if needed
        this.persistenceManager.saveRiskMetrics(metrics); // Persist stub metrics
    }
    calculateDrawdown() {
        // Stub: Drawdown calculation not available without state
        return 0;
    }
    calculateWinRate() {
        const closedPositions = []; // Stub: No state.positions
        if (closedPositions.length === 0)
            return 0;
        const winners = closedPositions.filter((p) => (p.pnl ?? 0) > 0);
        return winners.length / closedPositions.length;
    }
    getPosition(tokenAddress) {
        return undefined; // Stub: Not implemented
    }
    getAllPositions() {
        return []; // Stub: Not implemented
    }
    getActivePositions() {
        return []; // Stub: Not implemented
    }
    getRiskMetrics() {
        return {}; // Stub: Not implemented
    }
    start() {
        logger_1.default.info('Trading system started');
        this.tokenMonitor.clearOldData();
    }
    stop() {
        logger_1.default.info('Trading system stopped');
    }
}
exports.TradingSystem = TradingSystem;
//# sourceMappingURL=tradingSystem.js.map