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
    handleOHLCV(event: any): Promise<void>;
}
export default StrategyCoordinator;
//# sourceMappingURL=strategyCoordinator.d.ts.map