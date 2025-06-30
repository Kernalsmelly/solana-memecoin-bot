import { EventEmitter } from 'events';
interface VolatilitySqueezeOptions {
    priceChangeThreshold: number;
    volumeMultiplier: number;
    lookbackPeriodMs: number;
    checkIntervalMs: number;
}
export declare class VolatilitySqueeze extends EventEmitter {
    private tokenAnalyzer;
    private rateLimiter;
    private options;
    private lastCheckTime;
    constructor(options?: Partial<VolatilitySqueezeOptions>);
    start(): Promise<void>;
    private checkForSqueeze;
    private detectSqueeze;
    stop(): void;
}
export {};
//# sourceMappingURL=volatilitySqueeze.d.ts.map