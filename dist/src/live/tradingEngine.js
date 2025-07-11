"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingEngine = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const events_1 = require("events");
const web3_js_1 = require("@solana/web3.js"); // Correct PublicKey import
class TradingEngine extends events_1.EventEmitter {
    positions;
    maxPositions;
    maxPositionSize;
    maxDrawdown;
    notificationManager;
    initialBalance;
    currentBalance;
    highWaterMark;
    dailyPnL;
    dailyLoss;
    constructor(config) {
        super();
        this.positions = new Map();
        this.maxPositions = config.maxPositions;
        this.maxPositionSize = config.maxPositionSize;
        this.maxDrawdown = config.maxDrawdown;
        this.notificationManager = config.notificationManager;
        this.initialBalance = 1000; // Default starting balance
        this.currentBalance = this.initialBalance;
        this.highWaterMark = this.initialBalance;
        this.dailyPnL = 0;
        this.dailyLoss = 0;
        logger_1.default.info('Trading engine initialized', {
            maxPositions: this.maxPositions,
            maxPositionSize: this.maxPositionSize,
            maxDrawdown: this.maxDrawdown
        });
    }
    async processSignal(signal) {
        try {
            if (signal.signalType === 'buy') {
                await this.openPosition(signal);
            }
            else {
                await this.closePosition(signal.tokenAddress);
            }
        }
        catch (error) {
            logger_1.default.error('Error processing trading signal:', error);
            this.emit('error', error);
        }
    }
    async openPosition(signal) {
        // Check if we can open a new position
        if (this.positions.size >= this.maxPositions) {
            logger_1.default.warn('Maximum positions reached, cannot open new position');
            return;
        }
        // Check if position size is within limits
        if (signal.positionSize > this.maxPositionSize) {
            signal.positionSize = this.maxPositionSize;
        }
        // Create new position
        const position = {
            id: `${signal.tokenAddress}-${Date.now()}`, // Add unique ID
            tokenAddress: signal.tokenAddress,
            tokenSymbol: 'UNKNOWN', // TEMP FIX: Symbol not in signal
            tokenMint: new web3_js_1.PublicKey(signal.tokenAddress), // TEMP FIX: Placeholder, assuming address is mint
            tokenDecimals: 9, // TEMP FIX: Placeholder, common Solana decimals
            quantity: signal.positionSize / signal.price, // TEMP FIX: Placeholder calculation
            entryPrice: signal.price,
            currentPrice: signal.price,
            size: signal.positionSize,
            stopLoss: signal.stopLoss,
            takeProfit: 0, // TEMP FIX: Placeholder
            status: 'open',
            pnl: 0,
            timestamp: Date.now()
        };
        // Save position
        this.positions.set(signal.tokenAddress, position);
        // Notify
        await this.notificationManager.notifyTrade('open', position);
        this.emit('trade', { type: 'open', position });
    }
    async closePosition(tokenAddress) {
        const position = this.positions.get(tokenAddress);
        if (!position) {
            logger_1.default.warn(`No position found for token: ${tokenAddress}`);
            return;
        }
        // Update position status
        position.status = 'closed';
        // Calculate PnL
        const pnl = position.size * (position.currentPrice - position.entryPrice) / position.entryPrice;
        position.pnl = pnl;
        // Update balance and metrics
        this.currentBalance += pnl;
        this.dailyPnL += pnl;
        if (pnl < 0) {
            this.dailyLoss += Math.abs(pnl);
        }
        if (this.currentBalance > this.highWaterMark) {
            this.highWaterMark = this.currentBalance;
        }
        // Remove position
        this.positions.delete(tokenAddress);
        // Notify
        await this.notificationManager.notifyTrade('close', position);
        this.emit('trade', { type: 'close', position });
    }
    getRiskMetrics() {
        const drawdown = ((this.highWaterMark - this.currentBalance) / this.highWaterMark) * 100;
        const totalTrades = this.positions.size;
        const profitableTrades = Array.from(this.positions.values()).filter(p => typeof p.pnl === 'number' && p.pnl > 0).length;
        const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
        return {
            currentBalance: this.currentBalance,
            dailyPnL: this.dailyPnL,
            drawdown,
            winRate,
            activePositions: this.positions.size,
            availablePositions: this.maxPositions - this.positions.size,
            highWaterMark: this.highWaterMark,
            dailyLoss: this.dailyLoss
        };
    }
    getPositions() {
        return Array.from(this.positions.values());
    }
    getPosition(tokenAddress) {
        return this.positions.get(tokenAddress);
    }
    async updatePrice(tokenAddress, price) {
        const position = this.positions.get(tokenAddress);
        if (position) {
            position.currentPrice = price;
            // Check stop loss
            if (price <= position.stopLoss) {
                await this.closePosition(tokenAddress);
                logger_1.default.info(`Stop loss triggered for ${position.tokenSymbol}`);
            }
        }
    }
    resetDailyMetrics() {
        this.dailyPnL = 0;
        this.dailyLoss = 0;
    }
}
exports.TradingEngine = TradingEngine;
//# sourceMappingURL=tradingEngine.js.map