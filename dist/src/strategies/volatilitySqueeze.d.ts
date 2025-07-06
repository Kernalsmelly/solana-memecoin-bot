import { EventEmitter } from 'events';
interface VolatilitySqueezeOptions {
    priceChangeThreshold: number;
    volumeMultiplier: number;
    lookbackPeriodMs: number;
    checkIntervalMs: number;
}
import { Strategy } from '../strategy/StrategyCoordinator';
export declare class VolatilitySqueeze extends EventEmitter implements Strategy {
    name: string;
    execute(token: string): Promise<void>;
    setParams(params: Partial<VolatilitySqueezeOptions>): void;
    private options;
    private lastCheckTime;
    private interval;
    constructor(options?: Partial<VolatilitySqueezeOptions>);
    start(): void;
    stop(): void;
    private check;
}
export {};
//# sourceMappingURL=volatilitySqueeze.d.ts.map