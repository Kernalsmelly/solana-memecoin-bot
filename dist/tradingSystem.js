"use strict";
// src/tradingSystem.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingSystem = void 0;
const web3_js_1 = require("@solana/web3.js");
const orderExecution_1 = require("./orderExecution");
const contractValidator_1 = require("./contractValidator");
const tokenMonitor_1 = require("./tokenMonitor");
const persistenceManager_1 = require("./persistenceManager");
const logger_1 = __importDefault(require("./utils/logger"));
class TradingSystem {
    constructor(connection) {
        this.connection = connection;
        this.orderExecution = (0, orderExecution_1.createOrderExecution)(connection);
        this.contractValidator = (0, contractValidator_1.createContractValidator)(connection);
        this.tokenMonitor = new tokenMonitor_1.TokenMonitor();
        this.persistenceManager = new persistenceManager_1.PersistenceManager();
        this.state = this.persistenceManager.loadState();
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
            // Generate trading signal
            const signal = {
                tokenAddress: pattern.tokenAddress,
                price: pattern.metrics.price,
                stopLoss: pattern.metrics.price * 0.95, // 5% stop loss
                positionSize: this.calculatePositionSize(pattern.metrics.liquidity),
                confidence: pattern.confidence,
                timestamp: Date.now(),
                timeframe: '1h',
                signalType: 'buy' // Fixed missing signalType
            };
            // Execute trade if conditions met
            if (signal.confidence > 0.7 && this.canOpenPosition()) {
                await this.executeSignal(signal);
            }
        }
        catch (error) {
            logger_1.default.error('Error handling pattern:', error instanceof Error ? error.message : 'Unknown error');
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
                price: signal.price,
                stopLoss: signal.stopLoss,
                timestamp: Date.now()
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
        const maxSize = Math.min(this.state.riskMetrics.currentBalance * 0.1, // Max 10% of balance
        liquidity * 0.02 // Max 2% of liquidity
        );
        return Math.min(maxSize, 1000); // Hard cap at $1000
    }
    canOpenPosition() {
        return this.state.riskMetrics.activePositions < this.state.riskMetrics.availablePositions;
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
                price: position.currentPrice,
                timestamp: Date.now()
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
        const positions = this.state.positions;
        const activePositions = positions.filter(p => p.status === 'open');
        const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
        const metrics = {
            currentBalance: this.state.riskMetrics.currentBalance + totalPnL,
            dailyPnL: totalPnL,
            drawdown: this.calculateDrawdown(),
            winRate: this.calculateWinRate(),
            activePositions: activePositions.length,
            availablePositions: 3,
            highWaterMark: Math.max(this.state.riskMetrics.highWaterMark, this.state.riskMetrics.currentBalance + totalPnL),
            dailyLoss: Math.min(0, totalPnL)
        };
        this.state.riskMetrics = metrics;
        this.persistenceManager.saveRiskMetrics(metrics);
    }
    calculateDrawdown() {
        return (this.state.riskMetrics.highWaterMark - this.state.riskMetrics.currentBalance) / this.state.riskMetrics.highWaterMark;
    }
    calculateWinRate() {
        const closedPositions = this.state.positions.filter(p => p.status === 'closed');
        if (closedPositions.length === 0)
            return 0;
        const winners = closedPositions.filter(p => p.pnl > 0);
        return winners.length / closedPositions.length;
    }
    getPosition(tokenAddress) {
        return this.state.positions.find(p => p.tokenAddress === tokenAddress);
    }
    getAllPositions() {
        return this.state.positions;
    }
    getActivePositions() {
        return this.state.positions.filter(p => p.status === 'open');
    }
    getRiskMetrics() {
        return this.state.riskMetrics;
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
