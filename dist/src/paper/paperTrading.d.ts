import { Position, TradingSignal, RiskMetrics } from '../types';
import { NotificationManager } from '../live/notificationManager';
import { EventEmitter } from 'events';
interface PaperTradingConfig {
    initialBalance: number;
    maxPositions: number;
    maxPositionSize: number;
    maxDrawdown: number;
    notificationManager: NotificationManager;
}
export declare class PaperTradingEngine extends EventEmitter {
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
    constructor(config: PaperTradingConfig);
    processSignal(signal: TradingSignal): Promise<void>;
    private openPosition;
    private closePosition;
    getRiskMetrics(): RiskMetrics;
    getPositions(): Position[];
    getPosition(tokenAddress: string): Position | undefined;
    updatePrice(tokenAddress: string, price: number): Promise<void>;
    resetDailyMetrics(): void;
}
export {};
//# sourceMappingURL=paperTrading.d.ts.map