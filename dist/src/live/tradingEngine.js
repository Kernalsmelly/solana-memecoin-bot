"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingEngine = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const events_1 = require("events");
const web3_js_1 = require("@solana/web3.js"); // Correct PublicKey import
const tradeLogger_1 = require("../utils/tradeLogger");
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
        console.log('[DEBUG] openPosition received signal:', signal);
        // Create new position
        const position = {
            id: `${signal.tokenAddress}-${Date.now()}`, // Add unique ID
            tokenAddress: signal.tokenAddress,
            tokenSymbol: signal.tokenSymbol || 'UNKNOWN',
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
        // Log trade open
        tradeLogger_1.tradeLogger.log({
            timestamp: new Date().toISOString(),
            action: 'buy',
            token: position.tokenSymbol || 'UNKNOWN',
            pairAddress: position.tokenAddress,
            price: position.entryPrice,
            amount: position.size,
            pnl: 0,
            reason: 'entry',
            txid: '',
            success: true
        });
        // Notify
        await this.notificationManager.notifyTrade('open', position);
        this.emit('trade', { type: 'open', position });
    }
    consecutiveLosses = 0;
    totalFeesPaid = 0;
    totalSlippagePaid = 0;
    async closePosition(tokenAddress) {
        const position = this.positions.get(tokenAddress);
        if (!position) {
            logger_1.default.warn(`No position found for token: ${tokenAddress}`);
            return;
        }
        // Update position status
        position.status = 'closed';
        // Calculate raw PnL
        const rawPnl = position.size * (position.currentPrice - position.entryPrice) / position.entryPrice;
        // --- Cost modeling with real fee ---
        const { slippagePercent, feePerTradeSol } = this.config.trading;
        const avgPrice = (position.entryPrice + position.currentPrice) / 2;
        const slippageCost = avgPrice * position.size * (slippagePercent / 100);
        let feeCost = 2 * feePerTradeSol;
        // Try to fetch real on-chain fee for the close leg
        try {
            if (this.connection && typeof this.connection.getFeeForMessage === 'function' && position.closeMessage) {
                const feeResp = await this.connection.getFeeForMessage(position.closeMessage);
                if (feeResp && typeof feeResp.value === 'number') {
                    feeCost = feeResp.value / 1e9; // Convert lamports to SOL
                }
            }
        }
        catch (err) {
            logger_1.default.warn('Failed to fetch real fee, using config default:', err);
        }
        // Net PnL after costs
        const netPnl = rawPnl - slippageCost - feeCost;
        position.pnl = netPnl;
        // Accumulate costs for metrics
        this.totalFeesPaid += feeCost;
        this.totalSlippagePaid += slippageCost;
        // --- Alerting for Consecutive Losses ---
        if (netPnl < 0) {
            this.consecutiveLosses = (this.consecutiveLosses || 0) + 1;
        }
        else {
            this.consecutiveLosses = 0;
        }
        if (this.consecutiveLosses === 3) {
            await this.notificationManager.notify('🚨 3 Consecutive Losing Trades! Review bot performance and risk settings.', 'errors');
        }
        // --- Alerting for Drawdown Breach ---
        // Drawdown = (highWaterMark - currentBalance) / highWaterMark
        const drawdown = this.highWaterMark > 0 ? (this.highWaterMark - this.currentBalance) / this.highWaterMark : 0;
        const drawdownAlertPct = (this.config.risk?.maxDrawdownPercent ?? 10) / 100; // Configurable threshold
        if (drawdown >= drawdownAlertPct) {
            await this.notificationManager.notify(`🚨 Drawdown Breach: ${(drawdown * 100).toFixed(2)}% from high-water mark!`, 'errors');
        }
        // Update balance and metrics
        this.currentBalance += netPnl;
        this.dailyPnL += netPnl;
        if (netPnl < 0) {
            this.dailyLoss += Math.abs(netPnl);
        }
        if (this.currentBalance > this.highWaterMark) {
            this.highWaterMark = this.currentBalance;
        }
        // Log trade close
        tradeLogger_1.tradeLogger.log({
            timestamp: new Date().toISOString(),
            action: 'sell',
            token: position.tokenSymbol || 'UNKNOWN',
            pairAddress: position.tokenAddress,
            price: position.currentPrice,
            amount: position.size,
            pnl: position.pnl ?? 0,
            reason: 'stop_loss', // You may want to make this dynamic
            txid: '',
            success: true
        });
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