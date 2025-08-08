import EventEmitter from 'events';
export interface Strategy {
    name: string;
    enabled: boolean;
    cooldownSec: number;
    handleOHLCV(event: any): Promise<void>;
}
interface CoordinatorOptions {
    strategies: Strategy[];
    cooldownSec?: number;
    enabledStrategies?: string[];
    stratWeightsInterval?: number;
}
export declare class StrategyCoordinator extends EventEmitter {
    private strategies;
    private cooldowns;
    private enabled;
    private defaultCooldownSec;
    constructor(options: CoordinatorOptions);
    enableStrategy(name: string, enabled: boolean): void;
    getEnabledStrategies(): string[];
    /**
     * Called on every new OHLCV event. Schedules enabled strategies in order.
     */
    private strategyWeights;
    private strategyTradeHistory;
    private stratWeightsInterval;
    private weightUpdateTimer;
    handleOHLCV(event: any): Promise<void>;
    setStrategyWeight(name: string, weight: number): void;
    getStrategyWeight(name: string): number;
    recordTrade(strategy: string, pnl: number, win: boolean): void;
    getRecentStats(strategy: string): {
        roi: number;
        volatility: number;
        winRate: number;
    };
    updateStrategyWeights(): void;
    getWeightedStrategyOrder(): string[];
}
export default StrategyCoordinator;
//# sourceMappingURL=strategyCoordinator.d.ts.map