import { RiskMetrics } from '../types';
import { EventEmitter } from 'events';
interface RiskManagerConfig {
    maxDrawdown: number;
    maxDailyLoss: number;
    maxPositions: number;
    maxPositionSize: number;
    slippageBps?: number;
    maxVolatility?: number;
    maxPriceDeviation?: number;
    volWindow?: number;
    maxTradesPerMinute?: number;
    maxTradesPerHour?: number;
    maxTradesPerDay?: number;
    maxExecutionTime?: number;
    minSuccessRate?: number;
    emergencyStopThreshold?: number;
    maxPositionValueUsd?: number;
    maxLiquidityPercent?: number;
    minPositionValueUsd?: number;
}
export declare enum CircuitBreakerReason {
    HIGH_VOLATILITY = "HIGH_VOLATILITY",
    PRICE_DEVIATION = "PRICE_DEVIATION",
    TRADE_RATE_EXCEEDED = "TRADE_RATE_EXCEEDED",
    HIGH_DRAWDOWN = "HIGH_DRAWDOWN",
    HIGH_DAILY_LOSS = "HIGH_DAILY_LOSS",
    LOW_SUCCESS_RATE = "LOW_SUCCESS_RATE",
    EMERGENCY_STOP = "EMERGENCY_STOP",
    MANUAL_STOP = "MANUAL_STOP",
    CONTRACT_RISK = "CONTRACT_RISK"
}
export interface TradeExecution {
    tokenSymbol: string;
    startTime: number;
    endTime?: number;
    success: boolean;
    executionTime?: number;
    errorMessage?: string;
}
export declare class RiskManager extends EventEmitter {
    /**
     * Compute recommended position size (SOL) based on volatility and balance.
     * sizeSOL = min(maxExposureSol, balance * riskPct / sigma)
     * @param tokenSymbol Token symbol
     * @param balance Available SOL balance
     * @param riskPct Fraction of balance to risk (e.g. 0.01 = 1%)
     * @param maxExposureSol Max allowed position size (SOL)
     * @param windowMs Rolling window for volatility (default 30min)
     */
    getDynamicPositionSizeSol(tokenSymbol: string, balance: number, riskPct?: number, maxExposureSol?: number, windowMs?: number): number;
    readonly config: RiskManagerConfig;
    private initialBalance;
    private currentBalance;
    private dailyStartBalance;
    private highWaterMark;
    private activePositions;
    private trades;
    private circuitBreakers;
    private circuitBreakerTriggeredAt;
    private priceHistory;
    private tradeTimes;
    private tradeExecutions;
    private emergencyStopActive;
    private systemEnabled;
    /**
     * Compute recommended position size (USD) for a token, based on rolling volatility, balance, and liquidity.
     * - Caps by MAX_EXPOSURE_USD (env/config)
     * - Caps by maxLiquidityPercent (of available liquidity)
     * - Reduces size if volatility is high
     * Usage: riskManager.getPositionSizeUSD('SOL', price, balance, liquidityUSD)
     */
    getPositionSizeUSD(tokenSymbol: string, currentPrice: number, balance: number, liquidityUSD: number): number;
    constructor(config: RiskManagerConfig, initialState?: Partial<RiskMetrics> | null);
    /**
     * Returns the configured maximum position value in USD.
     */
    getMaxPositionValueUsd(): number;
    /**
     * Returns the current account balance (USD).
     * This method is provided for compatibility with code expecting getAccountBalance().
     */
    getAccountBalance(): number;
    /**
     * Returns the current balance.
     */
    getCurrentBalance(): number;
    canOpenPosition(size: number, tokenSymbol: string, currentPrice: number): boolean;
    getMetrics(): RiskMetrics & {
        pnl: number;
        totalFeesPaid?: number;
        totalSlippagePaid?: number;
    };
    updateBalance(newBalance: number): Promise<void>;
    recordTrade(pnl: number): void;
    incrementActivePositions(): void;
    decrementActivePositions(): void;
    updatePrice(tokenSymbol: string, price: number): void;
    startTradeExecution(tokenSymbol: string): string;
    completeTradeExecution(id: string, success: boolean, errorMessage?: string): void;
    triggerCircuitBreaker(reason: CircuitBreakerReason, message?: string): void;
    resetCircuitBreaker(reason: CircuitBreakerReason): void;
    resetAllCircuitBreakers(): void;
    triggerEmergencyStop(reason: string): Promise<void>;
    resetEmergencyStop(): void;
    disableSystem(): void;
    enableSystem(): void;
    private getDrawdown;
    private getDailyPnL;
    private getDailyLoss;
    private getWinRate;
    private getTradeSuccessRate;
    private getTradeCountInWindow;
    private checkRateLimits;
    private checkVolatility;
    private checkPerformanceMetrics;
    private resetDailyMetrics;
    private scheduleDailyReset;
    getMaxPositionSizeSol(): number;
    getMaxLiquidityPercent(): number;
    getMinPositionValueUsd(): number;
}
export {};
//# sourceMappingURL=riskManager.d.ts.map