import { EventEmitter } from 'events';
interface VolatilitySqueezeOptions {
    priceChangeThreshold: number;
    volumeMultiplier: number;
    lookbackPeriodMs: number;
    checkIntervalMs: number;
}
export declare class VolatilitySqueeze extends EventEmitter {
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