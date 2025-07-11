import { RiskMetrics } from '../types';
import logger from '../utils/logger';
import { EventEmitter } from 'events';

interface RiskManagerConfig {
    // Basic risk parameters
    maxDrawdown: number;
    maxDailyLoss: number;
    maxPositions: number;
    maxPositionSize: number;
    slippageBps?: number;
    
    // Circuit breaker parameters
    maxVolatility?: number;             // Max allowed price volatility (percentage) 
    maxPriceDeviation?: number;         // Max allowed deviation from moving average (percentage)
    volWindow?: number;                 // Window for volatility calculation (ms)
    
    // Rate limiting parameters
    maxTradesPerMinute?: number;        // Max trades per minute
    maxTradesPerHour?: number;          // Max trades per hour
    maxTradesPerDay?: number;           // Max trades per day
    
    // Performance monitoring
    maxExecutionTime?: number;          // Max time for trade execution (ms)
    minSuccessRate?: number;            // Minimum trade success rate (percentage)
    
    // Emergency stop parameters
    emergencyStopThreshold?: number;    // Threshold for emergency stop (percentage loss)
    maxPositionValueUsd?: number;       // Maximum position value in USD
    maxLiquidityPercent?: number;       // Maximum liquidity percentage
    minPositionValueUsd?: number;       // Minimum position value in USD
}

export enum CircuitBreakerReason {
    HIGH_VOLATILITY = 'HIGH_VOLATILITY',
    PRICE_DEVIATION = 'PRICE_DEVIATION',
    TRADE_RATE_EXCEEDED = 'TRADE_RATE_EXCEEDED',
    HIGH_DRAWDOWN = 'HIGH_DRAWDOWN',
    HIGH_DAILY_LOSS = 'HIGH_DAILY_LOSS',
    LOW_SUCCESS_RATE = 'LOW_SUCCESS_RATE',
    EMERGENCY_STOP = 'EMERGENCY_STOP',
    MANUAL_STOP = 'MANUAL_STOP',
    CONTRACT_RISK = 'CONTRACT_RISK'
}

export interface TradeExecution {
    tokenSymbol: string;
    startTime: number;
    endTime?: number;
    success: boolean;
    executionTime?: number;
    errorMessage?: string;
}

export class RiskManager extends EventEmitter {
    /**
     * Compute recommended position size (SOL) based on volatility and balance.
     * sizeSOL = min(maxExposureSol, balance * riskPct / sigma)
     * @param tokenSymbol Token symbol
     * @param balance Available SOL balance
     * @param riskPct Fraction of balance to risk (e.g. 0.01 = 1%)
     * @param maxExposureSol Max allowed position size (SOL)
     * @param windowMs Rolling window for volatility (default 30min)
     */
    public getDynamicPositionSizeSol(tokenSymbol: string, balance: number, riskPct = 0.01, maxExposureSol = 1, windowMs = 30 * 60 * 1000): number {
        // Gather price history for token
        const history = this.priceHistory.get(tokenSymbol) || [];
        const now = Date.now();
        const cutoff = now - windowMs;
        const windowPrices = history.filter(h => h.timestamp >= cutoff).map(h => h.price);
        if (windowPrices.length < 2) return Math.min(maxExposureSol, balance * riskPct); // fallback: no volatility info
        // Compute rolling stddev (sigma)
        const mean = windowPrices.reduce((a, b) => a + b, 0) / windowPrices.length;
        const variance = windowPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (windowPrices.length - 1);
        const sigma = Math.sqrt(variance);
        if (sigma === 0) return Math.min(maxExposureSol, balance * riskPct); // no volatility
        const size = Math.min(maxExposureSol, (balance * riskPct) / sigma);
        logger.info(`[RiskManager] getDynamicPositionSizeSol: sizeSOL=${size.toFixed(4)} (maxExposure=${maxExposureSol}, balance=${balance}, riskPct=${riskPct}, sigma=${sigma.toFixed(6)})`);
        return size;
    }

    public readonly config: RiskManagerConfig;
    private initialBalance: number;
    private currentBalance: number;
    private dailyStartBalance: number;
    private highWaterMark: number;
    private activePositions: number;
    private trades: { pnl: number; timestamp: number }[];
    
    // Circuit breaker state
    private circuitBreakers: Map<CircuitBreakerReason, boolean>;
    private circuitBreakerTriggeredAt: Map<CircuitBreakerReason, number>;
    private priceHistory: Map<string, { price: number; timestamp: number }[]>;
    
    // Rate limiting state
    private tradeTimes: number[];
    
    // Performance monitoring
    private tradeExecutions: TradeExecution[];
    
    // Emergency stop
    private emergencyStopActive: boolean;
    private systemEnabled: boolean;

    /**
     * Compute recommended position size (USD) for a token, based on rolling volatility, balance, and liquidity.
     * - Caps by MAX_EXPOSURE_USD (env/config)
     * - Caps by maxLiquidityPercent (of available liquidity)
     * - Reduces size if volatility is high
     * Usage: riskManager.getPositionSizeUSD('SOL', price, balance, liquidityUSD)
     */
    public getPositionSizeUSD(tokenSymbol: string, currentPrice: number, balance: number, liquidityUSD: number): number {
        const MAX_EXPOSURE_USD = Number(process.env.MAX_EXPOSURE_USD || this.config.maxPositionValueUsd || 20);
        const maxLiquidityPercent = Number(process.env.MAX_LIQUIDITY_PCT || this.config.maxLiquidityPercent || 0.05);
        // Rolling 30min volatility (σ)
        const now = Date.now();
        const windowMs = 30 * 60 * 1000;
        const history = (this.priceHistory.get(tokenSymbol) || []).filter(p => now - p.timestamp <= windowMs);
        const prices = history.map(p => p.price);
        const mean = prices.reduce((a, b) => a + b, 0) / (prices.length || 1);
        const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (prices.length || 1);
        const sigma = Math.sqrt(variance);
        // Volatility risk fraction: scale down if σ > 2%
        let riskFraction = 1.0;
        if (sigma / mean > 0.02) riskFraction = 0.5;
        if (sigma / mean > 0.05) riskFraction = 0.2;
        // Compute size
        const sizeByExposure = MAX_EXPOSURE_USD;
        const sizeByBalance = balance * riskFraction * currentPrice;
        const sizeByLiquidity = liquidityUSD * maxLiquidityPercent;
        const sizeUSD = Math.max(1, Math.min(sizeByExposure, sizeByBalance, sizeByLiquidity));
        logger.info(`[RiskManager] sizeUSD=${sizeUSD.toFixed(2)} (exposure=${sizeByExposure}, balance=${sizeByBalance}, liquidity=${sizeByLiquidity}, σ=${sigma.toFixed(4)})`);
        return sizeUSD;
    }

    constructor(config: RiskManagerConfig, initialState: Partial<RiskMetrics> | null = null) {
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
        const loadedBalance = initialState?.currentBalance;
        // Default to 1000 for test compatibility if not provided
        this.initialBalance = loadedBalance ?? 1000; // Treat loaded balance as starting point for this session
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
                 logger.warn(`Circuit breaker ${reason} loaded as active from state.`);
                 // this.circuitBreakerTriggeredAt.set(reason, Date.now()); // Example: Set trigger time to now if loaded as active
            }
        });

        logger.info('Risk Manager Initialized', {
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
        } else {
            // If loading state, log the loaded daily start balance.
            // resetDailyMetrics (called by scheduleDailyReset) will correct this if it's a new day.
            logger.info('Loaded daily start balance from state', { dailyStartBalance: this.dailyStartBalance });
        }
        
        // Schedule daily reset
        this.scheduleDailyReset();
    }
    
    /**
     * Returns the configured maximum position value in USD.
     */
    public getMaxPositionValueUsd(): number {
        return this.config.maxPositionValueUsd || 50; // Default to 50 if not set
    }

    /**
     * Returns the current account balance (USD).
     * This method is provided for compatibility with code expecting getAccountBalance().
     */
    public getAccountBalance(): number {
        logger.debug('[RiskManager] getAccountBalance() called, returning currentBalance: $' + this.currentBalance.toFixed(2));
        return this.getCurrentBalance();
    }

    /**
     * Returns the current balance.
     */
    public getCurrentBalance(): number {
        return this.currentBalance;
    }

    public canOpenPosition(size: number, tokenSymbol: string, currentPrice: number): boolean {
        if (!this.systemEnabled) {
            logger.warn('System is disabled, cannot open position');
            return false;
        }
        
        if (this.emergencyStopActive) {
            logger.warn('Emergency stop is active, cannot open position');
            return false;
        }
        
        for (const [reason, active] of this.circuitBreakers.entries()) {
            if (active) {
                logger.warn(`Circuit breaker active: ${reason}, cannot open position`);
                return false;
            }
        }
        
        if (size > this.config.maxPositionSize) {
            logger.warn(`Position size ${size} exceeds max ${this.config.maxPositionSize}`);
            return false;
        }

        if (this.activePositions >= this.config.maxPositions) {
            logger.warn(`Max positions reached: ${this.activePositions}`);
            return false;
        }

        const drawdown = this.getDrawdown();
        if (drawdown >= this.config.maxDrawdown) {
            this.triggerCircuitBreaker(CircuitBreakerReason.HIGH_DRAWDOWN);
            logger.warn(`Drawdown ${drawdown.toFixed(2)}% exceeds max ${this.config.maxDrawdown}%`);
            return false;
        }

        const dailyLoss = this.getDailyLoss();
        if (dailyLoss >= this.config.maxDailyLoss) {
            this.triggerCircuitBreaker(CircuitBreakerReason.HIGH_DAILY_LOSS);
            logger.warn(`Daily loss ${dailyLoss.toFixed(2)}% exceeds max ${this.config.maxDailyLoss}%`);
            return false;
        }
        
        if (!this.checkRateLimits()) {
            this.triggerCircuitBreaker(CircuitBreakerReason.TRADE_RATE_EXCEEDED);
            logger.warn('Rate limits exceeded');
            return false;
        }
        
        if (!this.checkVolatility(tokenSymbol, currentPrice)) {
            logger.warn(`Volatility check failed for ${tokenSymbol}`);
            return false;
        }
        
        if (!this.checkPerformanceMetrics()) {
            logger.warn('Performance metrics below threshold');
            return false;
        }
        
        return true;
    }

    // Optionally expects this.tradingEngine to be set externally
    public getMetrics(): RiskMetrics & { pnl: number, totalFeesPaid?: number, totalSlippagePaid?: number } {
        const effectiveHighWaterMark = Math.max(this.highWaterMark, this.currentBalance);
        // Optionally include totalFeesPaid and totalSlippagePaid if present on this.tradingEngine
        const extraMetrics = (this as any).tradingEngine ? {
            totalFeesPaid: (this as any).tradingEngine.totalFeesPaid,
            totalSlippagePaid: (this as any).tradingEngine.totalSlippagePaid
        } : {};
        return {
            currentBalance: this.currentBalance,
            highWaterMark: effectiveHighWaterMark,
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
            },
            pnl: this.currentBalance - this.initialBalance,
            ...extraMetrics
        };
    }

    public async updateBalance(newBalance: number) {
        if (this.initialBalance === 0) {
            this.initialBalance = newBalance;
            this.dailyStartBalance = newBalance;
            this.highWaterMark = newBalance;
        }

        this.currentBalance = newBalance;

        // 1. Check and trigger circuit breakers BEFORE emergency stop
        const dailyLoss = this.getDailyLoss();
        if (dailyLoss >= this.config.maxDailyLoss!) {
            this.triggerCircuitBreaker(CircuitBreakerReason.HIGH_DAILY_LOSS);
        }
        const drawdown = this.getDrawdown();
        if (drawdown >= this.config.maxDrawdown) {
            this.triggerCircuitBreaker(CircuitBreakerReason.HIGH_DRAWDOWN);
        }

        // 2. Update high water mark
        if (newBalance > this.highWaterMark) {
            this.highWaterMark = newBalance;
        }
        
        // 3. Now check for emergency stop
        if (this.dailyStartBalance > 0) {
            if (dailyLoss >= this.config.emergencyStopThreshold!) {
                this.triggerEmergencyStop(`Daily loss ${dailyLoss.toFixed(2)}% exceeds emergency threshold ${this.config.emergencyStopThreshold}%`);
            }
        }
    }

    public recordTrade(pnl: number) {
        this.trades.push({
            pnl,
            timestamp: Date.now()
        });
        this.updateBalance(this.currentBalance + pnl);
        this.tradeTimes.push(Date.now());
    }

    public incrementActivePositions() {
        this.activePositions++;
    }

    public decrementActivePositions() {
        this.activePositions = Math.max(0, this.activePositions - 1);
    }
    
    public updatePrice(tokenSymbol: string, price: number) {
        if (!this.priceHistory.has(tokenSymbol)) {
            this.priceHistory.set(tokenSymbol, []);
        }
        
        const history = this.priceHistory.get(tokenSymbol)!;
        history.push({ price, timestamp: Date.now() });
        
        const cutoff = Date.now() - this.config.volWindow!;
        // Explicitly check history[0] exists before accessing timestamp
        while (history.length > 0 && history[0] && history[0].timestamp < cutoff) {
            history.shift();
        }
    }
    
    public startTradeExecution(tokenSymbol: string): string {
        const id = `${tokenSymbol}-${Date.now()}`;
        this.tradeExecutions.push({
            tokenSymbol,
            startTime: Date.now(),
            success: false
        });
        return id;
    }
    
    public completeTradeExecution(id: string, success: boolean, errorMessage?: string) {
        const parts = id.split('-');
        // Safely extract and parse the timestamp
        const timestampStr = parts.pop(); // Get the last part (removes it from parts)
        if (!timestampStr) {
            logger.error(`Invalid trade execution ID format: ${id} - Missing timestamp part.`);
            return;
        }
        
        const timestamp = parseInt(timestampStr);
        if (isNaN(timestamp)) {
            logger.error(`Invalid trade execution ID format: ${id} - Timestamp part is not a number: ${timestampStr}`);
            return;
        }
        
        const tokenSymbol = parts.join('-'); // Re-join remaining parts in case symbol had hyphens
        if (!tokenSymbol) {
            logger.error(`Invalid trade execution ID format: ${id} - Missing token symbol part.`);
            return;
        }
        
        const execution = this.tradeExecutions.find(e => e.startTime === timestamp && e.tokenSymbol === tokenSymbol);
        if (execution) {
            execution.endTime = Date.now();
            execution.success = success;
            execution.executionTime = execution.endTime - execution.startTime;
            execution.errorMessage = errorMessage;
            
            if (execution.executionTime > this.config.maxExecutionTime!) {
                logger.warn(`Trade execution time ${execution.executionTime}ms exceeds max ${this.config.maxExecutionTime}ms`);
            }
            
            this.tradeExecutions = this.tradeExecutions.filter(e => 
                e.startTime > Date.now() - 24 * 60 * 60 * 1000
            );
        }
    }
    
    public triggerCircuitBreaker(reason: CircuitBreakerReason, message?: string) {
        if (!this.circuitBreakers.get(reason)) {
            this.circuitBreakers.set(reason, true);
            this.circuitBreakerTriggeredAt.set(reason, Date.now());
            
            logger.error(`Circuit breaker triggered: ${reason}${message ? ` - ${message}` : ''}`);
            
            this.emit('circuitBreaker', reason); // For test compatibility
            this.emit('circuitBreaker', { reason, message, timestamp: Date.now() });
        }
    }
    
    public resetCircuitBreaker(reason: CircuitBreakerReason) {
        if (this.circuitBreakers.get(reason)) {
            this.circuitBreakers.set(reason, false);
            logger.info(`Circuit breaker reset: ${reason}`);
            
            this.emit('circuitBreakerReset', { reason, timestamp: Date.now() });
        }
    }
    
    public resetAllCircuitBreakers() {
        Object.values(CircuitBreakerReason).forEach(reason => {
            this.resetCircuitBreaker(reason as CircuitBreakerReason);
        });
    }
    
    public async triggerEmergencyStop(reason: string) {
        if (!this.emergencyStopActive) {
            this.emergencyStopActive = true;
            this.triggerCircuitBreaker(CircuitBreakerReason.EMERGENCY_STOP, reason);
            
            logger.error(`[EMERGENCY_STOP] Trading halted: ${reason}`);
            const { sendAlert } = await import('../utils/notifications');
            sendAlert && sendAlert(`🚨 EMERGENCY STOP: Trading halted. Reason: ${reason}`, 'CRITICAL');
            this.emit('emergencyStop', reason); // For test compatibility
            this.emit('emergencyStop', { reason, timestamp: Date.now() });
        }
    }
    
    public resetEmergencyStop() {
        if (this.emergencyStopActive) {
            this.emergencyStopActive = false;
            this.resetCircuitBreaker(CircuitBreakerReason.EMERGENCY_STOP);
            
            logger.info('Emergency stop reset');
            
            this.emit('emergencyStopReset', { timestamp: Date.now() });
        }
    }
    
    public disableSystem() {
        this.systemEnabled = false;
        this.triggerCircuitBreaker(CircuitBreakerReason.MANUAL_STOP, 'System manually disabled');
        
        logger.info('System disabled');
        
        this.emit('systemDisabled', { timestamp: Date.now() });
    }
    
    public enableSystem() {
        this.systemEnabled = true;
        this.resetCircuitBreaker(CircuitBreakerReason.MANUAL_STOP);
        
        logger.info('System enabled');
        
        this.emit('systemEnabled', { timestamp: Date.now() });
    }

    private getDrawdown(): number {
        if (this.highWaterMark === 0) return 0;
        return ((this.highWaterMark - this.currentBalance) / this.highWaterMark) * 100;
    }

    private getDailyPnL(): number {
        return this.currentBalance - this.dailyStartBalance;
    }

    private getDailyLoss(): number {
        const dailyPnL = this.getDailyPnL();
        return dailyPnL < 0 ? Math.abs(dailyPnL) / this.dailyStartBalance * 100 : 0;
    }

    private getWinRate(): number {
        if (this.trades.length === 0) return 0;
        const winningTrades = this.trades.filter(t => t.pnl > 0).length;
        return (winningTrades / this.trades.length) * 100;
    }
    
    private getTradeSuccessRate(): number {
        const executions = this.tradeExecutions.filter(e => e.endTime !== undefined);
        if (executions.length === 0) return 100;
        
        const successful = executions.filter(e => e.success).length;
        return (successful / executions.length) * 100;
    }
    
    private getTradeCountInWindow(windowMs: number): number {
        const cutoff = Date.now() - windowMs;
        return this.tradeTimes.filter(t => t >= cutoff).length;
    }
    
    private checkRateLimits(): boolean {
        const perMinute = this.getTradeCountInWindow(60 * 1000);
        if (perMinute >= this.config.maxTradesPerMinute!) {
            return false;
        }
        
        const perHour = this.getTradeCountInWindow(60 * 60 * 1000);
        if (perHour >= this.config.maxTradesPerHour!) {
            return false;
        }
        
        const perDay = this.getTradeCountInWindow(24 * 60 * 60 * 1000);
        if (perDay >= this.config.maxTradesPerDay!) {
            return false;
        }
        
        return true;
    }
    
    private checkVolatility(tokenSymbol: string, currentPrice: number): boolean {
        const history = this.priceHistory.get(tokenSymbol);
        if (!history || history.length < 2) {
            return true; 
        }
        
        const prices = history.map(h => h.price);
        const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        
        const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
        const volatility = Math.sqrt(variance) / mean * 100;
        
        const deviation = Math.abs((currentPrice - mean) / mean * 100);
        
        if (volatility > this.config.maxVolatility!) {
            this.triggerCircuitBreaker(
                CircuitBreakerReason.HIGH_VOLATILITY, 
                `Volatility ${volatility.toFixed(2)}% exceeds threshold ${this.config.maxVolatility}%`
            );
            return false;
        }
        
        if (deviation > this.config.maxPriceDeviation!) {
            this.triggerCircuitBreaker(
                CircuitBreakerReason.PRICE_DEVIATION, 
                `Price deviation ${deviation.toFixed(2)}% exceeds threshold ${this.config.maxPriceDeviation}%`
            );
            return false;
        }
        
        return true;
    }
    
    private checkPerformanceMetrics(): boolean {
        const successRate = this.getTradeSuccessRate();
        if (this.tradeExecutions.length >= 10 && successRate < this.config.minSuccessRate!) {
            this.triggerCircuitBreaker(
                CircuitBreakerReason.LOW_SUCCESS_RATE, 
                `Success rate ${successRate.toFixed(2)}% below threshold ${this.config.minSuccessRate}%`
            );
            return false;
        }
        
        return true;
    }

    private resetDailyMetrics() {
        this.dailyStartBalance = this.currentBalance;
        
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        this.trades = this.trades.filter(t => t.timestamp >= oneDayAgo);
        this.tradeTimes = this.tradeTimes.filter(t => t >= oneDayAgo);
        this.tradeExecutions = this.tradeExecutions.filter(e => e.startTime >= oneDayAgo);
        
        logger.info('Daily metrics reset', {
            balance: this.currentBalance,
            trades: this.trades.length
        });
    }
    
    private scheduleDailyReset() {
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

    public getMaxPositionSizeSol(): number {
        return this.config.maxPositionSize;
    }

    public getMaxLiquidityPercent(): number {
        // Return 0 if not set to avoid accidental large trades if config is missing
        return this.config.maxLiquidityPercent ?? 0; 
    }

    public getMinPositionValueUsd(): number {
        logger.warn('getMinPositionValueUsd not implemented, returning default $10');
        return this.config.minPositionValueUsd ?? 10; // Default $10
    }
}
