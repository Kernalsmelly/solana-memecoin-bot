import { Position, TradingSignal, RiskMetrics } from '../types';
import { NotificationManager } from './notificationManager';
import { EventEmitter } from 'events';
interface TradingEngineConfig {
    maxPositions: number;
    maxPositionSize: number;
    maxDrawdown: number;
    notificationManager: NotificationManager;
}
export declare class TradingEngine extends EventEmitter {
    private positions;
    private maxPositions;
    private maxPositionSize;
    private maxDrawdown;
    private notificationManager;
    private initialBalance;
    private currentBalance;
    private highWaterMark;
    private dailyPnL;
    private dailyLoss;
    constructor(config: TradingEngineConfig);
    processSignal(signal: TradingSignal): Promise<void>;
    private openPosition;
    private consecutiveLosses;
    private totalFeesPaid;
    private totalSlippagePaid;
    private closePosition;
    getRiskMetrics(): RiskMetrics;
    getPositions(): Position[];
    getPosition(tokenAddress: string): Position | undefined;
    updatePrice(tokenAddress: string, price: number): Promise<void>;
    resetDailyMetrics(): void;
}
export {};
//# sourceMappingURL=tradingEngine.d.ts.map