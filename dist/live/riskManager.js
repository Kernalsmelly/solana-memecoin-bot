"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManager = exports.CircuitBreakerReason = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const events_1 = require("events");
var CircuitBreakerReason;
(function (CircuitBreakerReason) {
    CircuitBreakerReason["HIGH_VOLATILITY"] = "HIGH_VOLATILITY";
    CircuitBreakerReason["PRICE_DEVIATION"] = "PRICE_DEVIATION";
    CircuitBreakerReason["TRADE_RATE_EXCEEDED"] = "TRADE_RATE_EXCEEDED";
    CircuitBreakerReason["HIGH_DRAWDOWN"] = "HIGH_DRAWDOWN";
    CircuitBreakerReason["HIGH_DAILY_LOSS"] = "HIGH_DAILY_LOSS";
    CircuitBreakerReason["LOW_SUCCESS_RATE"] = "LOW_SUCCESS_RATE";
    CircuitBreakerReason["EMERGENCY_STOP"] = "EMERGENCY_STOP";
    CircuitBreakerReason["MANUAL_STOP"] = "MANUAL_STOP";
    CircuitBreakerReason["CONTRACT_RISK"] = "CONTRACT_RISK";
})(CircuitBreakerReason || (exports.CircuitBreakerReason = CircuitBreakerReason = {}));
class RiskManager extends events_1.EventEmitter {
    constructor(config, initialState = null) {
        super();
        this.config = {
            ...config,
            slippageBps: config.slippageBps || 100,
            maxVolatility: config.maxVolatility || 25,
            maxPriceDeviation: config.maxPriceDeviation || 15,
            volWindow: config.volWindow || 300000, // 5 minutes
            maxTradesPerMinute: config.maxTradesPerMinute || 5,
            maxTradesPerHour: config.maxTradesPerHour || 30,
            maxTradesPerDay: config.maxTradesPerDay || 100,
            maxExecutionTime: config.maxExecutionTime || 15000, // 15 seconds
            minSuccessRate: config.minSuccessRate || 70,
            emergencyStopThreshold: config.emergencyStopThreshold || 15,
            maxPositionValueUsd: config.maxPositionValueUsd || 50,
            maxLiquidityPercent: config.maxLiquidityPercent || 0.05,
            minPositionValueUsd: config.minPositionValueUsd || 10
        };
        // Initialize state (defaults or from initialState)
        const loadedBalance = initialState?.currentBalance; // Base on loaded current balance
        this.initialBalance = loadedBalance ?? 0; // Treat loaded balance as starting point for this session
        this.currentBalance = loadedBalance ?? this.initialBalance;
        this.dailyStartBalance = initialState?.dailyStartBalance ?? this.currentBalance; // Load if available, else use current
        this.highWaterMark = initialState?.highWaterMark ?? this.initialBalance;
        this.activePositions = initialState?.activePositions ?? 0;
        this.emergencyStopActive = initialState?.emergencyStopActive ?? false;
        this.systemEnabled = initialState?.systemEnabled ?? true; // Default to true, can be overridden by state
        // Initialize internal arrays (these are not persisted in RiskMetrics)
        this.trades = [];
        this.tradeTimes = [];
        this.tradeExecutions = [];
        this.priceHistory = new Map();
        // Initialize circuit breakers from state if available
        this.circuitBreakers = new Map();
        this.circuitBreakerTriggeredAt = new Map(); // Cannot load trigger times from RiskMetrics state
        Object.values(CircuitBreakerReason).forEach(reason => {
            // Load state if available, otherwise default to false
            const breakerActive = initialState?.circuitBreakers?.[reason] ?? false;
            this.circuitBreakers.set(reason, breakerActive);
            if (breakerActive) {
                // We know it was active, but not exactly when it triggered from RiskMetrics state alone.
                // Log it or potentially set a default trigger time if needed for logic.
                logger_1.default.warn(`Circuit breaker ${reason} loaded as active from state.`);
                // this.circuitBreakerTriggeredAt.set(reason, Date.now()); // Example: Set trigger time to now if loaded as active
            }
        });
        logger_1.default.info('Risk Manager Initialized', {
            initialBalance: this.initialBalance,
            currentBalance: this.currentBalance,
            dailyStartBalance: this.dailyStartBalance,
            loadedFromState: !!initialState
        });
        // Reset daily metrics only if NOT loading from state OR if state is from a previous day
        // Simple check: If loaded state exists, assume it's recent enough unless resetDailyMetrics detects otherwise.
        // scheduleDailyReset will handle the midnight reset regardless.
        if (!initialState) {
            this.resetDailyMetrics();
        }
        else {
            // If loading state, log the loaded daily start balance.
            // resetDailyMetrics (called by scheduleDailyReset) will correct this if it's a new day.
            logger_1.default.info('Loaded daily start balance from state', { dailyStartBalance: this.dailyStartBalance });
        }
        // Schedule daily reset
        this.scheduleDailyReset();
    }
    /**
     * Returns the configured maximum position value in USD.
     */
    getMaxPositionValueUsd() {
        return this.config.maxPositionValueUsd || 50; // Default to 50 if not set
    }
    /**
     * Returns the current balance.
     */
    getCurrentBalance() {
        return this.currentBalance;
    }
    canOpenPosition(size, tokenSymbol, currentPrice) {
        if (!this.systemEnabled) {
            logger_1.default.warn('System is disabled, cannot open position');
            return false;
        }
        if (this.emergencyStopActive) {
            logger_1.default.warn('Emergency stop is active, cannot open position');
            return false;
        }
        for (const [reason, active] of this.circuitBreakers.entries()) {
            if (active) {
                logger_1.default.warn(`Circuit breaker active: ${reason}, cannot open position`);
                return false;
            }
        }
        if (size > this.config.maxPositionSize) {
            logger_1.default.warn(`Position size ${size} exceeds max ${this.config.maxPositionSize}`);
            return false;
        }
        if (this.activePositions >= this.config.maxPositions) {
            logger_1.default.warn(`Max positions reached: ${this.activePositions}`);
            return false;
        }
        const drawdown = this.getDrawdown();
        if (drawdown >= this.config.maxDrawdown) {
            this.triggerCircuitBreaker(CircuitBreakerReason.HIGH_DRAWDOWN);
            logger_1.default.warn(`Drawdown ${drawdown.toFixed(2)}% exceeds max ${this.config.maxDrawdown}%`);
            return false;
        }
        const dailyLoss = this.getDailyLoss();
        if (dailyLoss >= this.config.maxDailyLoss) {
            this.triggerCircuitBreaker(CircuitBreakerReason.HIGH_DAILY_LOSS);
            logger_1.default.warn(`Daily loss ${dailyLoss.toFixed(2)}% exceeds max ${this.config.maxDailyLoss}%`);
            return false;
        }
        if (!this.checkRateLimits()) {
            this.triggerCircuitBreaker(CircuitBreakerReason.TRADE_RATE_EXCEEDED);
            logger_1.default.warn('Rate limits exceeded');
            return false;
        }
        if (!this.checkVolatility(tokenSymbol, currentPrice)) {
            logger_1.default.warn(`Volatility check failed for ${tokenSymbol}`);
            return false;
        }
        if (!this.checkPerformanceMetrics()) {
            logger_1.default.warn('Performance metrics below threshold');
            return false;
        }
        return true;
    }
    getMetrics() {
        return {
            currentBalance: this.currentBalance,
            highWaterMark: this.highWaterMark,
            drawdown: this.getDrawdown(),
            dailyPnL: this.getDailyPnL(),
            dailyLoss: this.getDailyLoss(),
            dailyStartBalance: this.dailyStartBalance,
            winRate: this.getWinRate(),
            activePositions: this.activePositions,
            availablePositions: this.config.maxPositions - this.activePositions,
            circuitBreakers: Object.fromEntries(this.circuitBreakers),
            emergencyStopActive: this.emergencyStopActive,
            systemEnabled: this.systemEnabled,
            successRate: this.getTradeSuccessRate(),
            tradeCount: {
                minute: this.getTradeCountInWindow(60 * 1000),
                hour: this.getTradeCountInWindow(60 * 60 * 1000),
                day: this.getTradeCountInWindow(24 * 60 * 60 * 1000)
            }
        };
    }
    updateBalance(newBalance) {
        if (this.initialBalance === 0) {
            this.initialBalance = newBalance;
            this.dailyStartBalance = newBalance;
            this.highWaterMark = newBalance;
        }
        this.currentBalance = newBalance;
        if (newBalance > this.highWaterMark) {
            this.highWaterMark = newBalance;
        }
        if (this.dailyStartBalance > 0) {
            const dailyLoss = this.getDailyLoss();
            if (dailyLoss >= this.config.emergencyStopThreshold) {
                this.triggerEmergencyStop(`Daily loss ${dailyLoss.toFixed(2)}% exceeds emergency threshold ${this.config.emergencyStopThreshold}%`);
            }
        }
    }
    recordTrade(pnl) {
        this.trades.push({
            pnl,
            timestamp: Date.now()
        });
        this.updateBalance(this.currentBalance + pnl);
        this.tradeTimes.push(Date.now());
    }
    incrementActivePositions() {
        this.activePositions++;
    }
    decrementActivePositions() {
        this.activePositions = Math.max(0, this.activePositions - 1);
    }
    updatePrice(tokenSymbol, price) {
        if (!this.priceHistory.has(tokenSymbol)) {
            this.priceHistory.set(tokenSymbol, []);
        }
        const history = this.priceHistory.get(tokenSymbol);
        history.push({ price, timestamp: Date.now() });
        const cutoff = Date.now() - this.config.volWindow;
        while (history.length > 0 && history[0].timestamp < cutoff) {
            history.shift();
        }
    }
    startTradeExecution(tokenSymbol) {
        const id = `${tokenSymbol}-${Date.now()}`;
        this.tradeExecutions.push({
            tokenSymbol,
            startTime: Date.now(),
            success: false
        });
        return id;
    }
    completeTradeExecution(id, success, errorMessage) {
        const parts = id.split('-');
        const timestamp = parseInt(parts[parts.length - 1]);
        const execution = this.tradeExecutions.find(e => e.startTime === timestamp && e.tokenSymbol === parts[0]);
        if (execution) {
            execution.endTime = Date.now();
            execution.success = success;
            execution.executionTime = execution.endTime - execution.startTime;
            execution.errorMessage = errorMessage;
            if (execution.executionTime > this.config.maxExecutionTime) {
                logger_1.default.warn(`Trade execution time ${execution.executionTime}ms exceeds max ${this.config.maxExecutionTime}ms`);
            }
            this.tradeExecutions = this.tradeExecutions.filter(e => e.startTime > Date.now() - 24 * 60 * 60 * 1000);
        }
    }
    triggerCircuitBreaker(reason, message) {
        if (!this.circuitBreakers.get(reason)) {
            this.circuitBreakers.set(reason, true);
            this.circuitBreakerTriggeredAt.set(reason, Date.now());
            logger_1.default.error(`Circuit breaker triggered: ${reason}${message ? ` - ${message}` : ''}`);
            this.emit('circuitBreaker', { reason, message, timestamp: Date.now() });
        }
    }
    resetCircuitBreaker(reason) {
        if (this.circuitBreakers.get(reason)) {
            this.circuitBreakers.set(reason, false);
            logger_1.default.info(`Circuit breaker reset: ${reason}`);
            this.emit('circuitBreakerReset', { reason, timestamp: Date.now() });
        }
    }
    resetAllCircuitBreakers() {
        Object.values(CircuitBreakerReason).forEach(reason => {
            this.resetCircuitBreaker(reason);
        });
    }
    triggerEmergencyStop(reason) {
        if (!this.emergencyStopActive) {
            this.emergencyStopActive = true;
            this.triggerCircuitBreaker(CircuitBreakerReason.EMERGENCY_STOP, reason);
            logger_1.default.error(`EMERGENCY STOP ACTIVATED: ${reason}`);
            this.emit('emergencyStop', { reason, timestamp: Date.now() });
        }
    }
    resetEmergencyStop() {
        if (this.emergencyStopActive) {
            this.emergencyStopActive = false;
            this.resetCircuitBreaker(CircuitBreakerReason.EMERGENCY_STOP);
            logger_1.default.info('Emergency stop reset');
            this.emit('emergencyStopReset', { timestamp: Date.now() });
        }
    }
    disableSystem() {
        this.systemEnabled = false;
        this.triggerCircuitBreaker(CircuitBreakerReason.MANUAL_STOP, 'System manually disabled');
        logger_1.default.info('System disabled');
        this.emit('systemDisabled', { timestamp: Date.now() });
    }
    enableSystem() {
        this.systemEnabled = true;
        this.resetCircuitBreaker(CircuitBreakerReason.MANUAL_STOP);
        logger_1.default.info('System enabled');
        this.emit('systemEnabled', { timestamp: Date.now() });
    }
    getDrawdown() {
        if (this.highWaterMark === 0)
            return 0;
        return ((this.highWaterMark - this.currentBalance) / this.highWaterMark) * 100;
    }
    getDailyPnL() {
        return this.currentBalance - this.dailyStartBalance;
    }
    getDailyLoss() {
        const dailyPnL = this.getDailyPnL();
        return dailyPnL < 0 ? Math.abs(dailyPnL) / this.dailyStartBalance * 100 : 0;
    }
    getWinRate() {
        if (this.trades.length === 0)
            return 0;
        const winningTrades = this.trades.filter(t => t.pnl > 0).length;
        return (winningTrades / this.trades.length) * 100;
    }
    getTradeSuccessRate() {
        const executions = this.tradeExecutions.filter(e => e.endTime !== undefined);
        if (executions.length === 0)
            return 100;
        const successful = executions.filter(e => e.success).length;
        return (successful / executions.length) * 100;
    }
    getTradeCountInWindow(windowMs) {
        const cutoff = Date.now() - windowMs;
        return this.tradeTimes.filter(t => t >= cutoff).length;
    }
    checkRateLimits() {
        const perMinute = this.getTradeCountInWindow(60 * 1000);
        if (perMinute >= this.config.maxTradesPerMinute) {
            return false;
        }
        const perHour = this.getTradeCountInWindow(60 * 60 * 1000);
        if (perHour >= this.config.maxTradesPerHour) {
            return false;
        }
        const perDay = this.getTradeCountInWindow(24 * 60 * 60 * 1000);
        if (perDay >= this.config.maxTradesPerDay) {
            return false;
        }
        return true;
    }
    checkVolatility(tokenSymbol, currentPrice) {
        const history = this.priceHistory.get(tokenSymbol);
        if (!history || history.length < 2) {
            return true;
        }
        const prices = history.map(h => h.price);
        const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
        const volatility = Math.sqrt(variance) / mean * 100;
        const deviation = Math.abs((currentPrice - mean) / mean * 100);
        if (volatility > this.config.maxVolatility) {
            this.triggerCircuitBreaker(CircuitBreakerReason.HIGH_VOLATILITY, `Volatility ${volatility.toFixed(2)}% exceeds threshold ${this.config.maxVolatility}%`);
            return false;
        }
        if (deviation > this.config.maxPriceDeviation) {
            this.triggerCircuitBreaker(CircuitBreakerReason.PRICE_DEVIATION, `Price deviation ${deviation.toFixed(2)}% exceeds threshold ${this.config.maxPriceDeviation}%`);
            return false;
        }
        return true;
    }
    checkPerformanceMetrics() {
        const successRate = this.getTradeSuccessRate();
        if (this.tradeExecutions.length >= 10 && successRate < this.config.minSuccessRate) {
            this.triggerCircuitBreaker(CircuitBreakerReason.LOW_SUCCESS_RATE, `Success rate ${successRate.toFixed(2)}% below threshold ${this.config.minSuccessRate}%`);
            return false;
        }
        return true;
    }
    resetDailyMetrics() {
        this.dailyStartBalance = this.currentBalance;
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.trades = this.trades.filter(t => t.timestamp >= oneDayAgo);
        this.tradeTimes = this.tradeTimes.filter(t => t >= oneDayAgo);
        this.tradeExecutions = this.tradeExecutions.filter(e => e.startTime >= oneDayAgo);
        logger_1.default.info('Daily metrics reset', {
            balance: this.currentBalance,
            trades: this.trades.length
        });
    }
    scheduleDailyReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const timeUntilMidnight = tomorrow.getTime() - now.getTime();
        setTimeout(() => {
            this.resetDailyMetrics();
            this.scheduleDailyReset();
        }, timeUntilMidnight);
    }
    getMaxPositionSizeSol() {
        return this.config.maxPositionSize;
    }
    getMaxLiquidityPercent() {
        // Return 0 if not set to avoid accidental large trades if config is missing
        return this.config.maxLiquidityPercent ?? 0;
    }
    getMinPositionValueUsd() {
        logger_1.default.warn('getMinPositionValueUsd not implemented, returning default $10');
        return this.config.minPositionValueUsd ?? 10; // Default $10
    }
}
exports.RiskManager = RiskManager;
