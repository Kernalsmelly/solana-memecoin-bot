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
    constructor(config: RiskManagerConfig, initialState?: Partial<RiskMetrics> | null);
    /**
     * Returns the configured maximum position value in USD.
     */
    getMaxPositionValueUsd(): number;
    /**
     * Returns the current balance.
     */
    getCurrentBalance(): number;
    canOpenPosition(size: number, tokenSymbol: string, currentPrice: number): boolean;
    getMetrics(): RiskMetrics;
    updateBalance(newBalance: number): void;
    recordTrade(pnl: number): void;
    incrementActivePositions(): void;
    decrementActivePositions(): void;
    updatePrice(tokenSymbol: string, price: number): void;
    startTradeExecution(tokenSymbol: string): string;
    completeTradeExecution(id: string, success: boolean, errorMessage?: string): void;
    triggerCircuitBreaker(reason: CircuitBreakerReason, message?: string): void;
    resetCircuitBreaker(reason: CircuitBreakerReason): void;
    resetAllCircuitBreakers(): void;
    triggerEmergencyStop(reason: string): void;
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