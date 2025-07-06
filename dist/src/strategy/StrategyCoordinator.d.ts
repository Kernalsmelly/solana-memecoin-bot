import EventEmitter from 'events';
export interface Strategy {
    name: string;
    execute: (token: string) => Promise<void>;
}
export interface StrategyCoordinatorOptions {
    maxConcurrent: number;
    cooldownMs: number;
    strategies: Strategy[];
}
/**
 * Coordinates execution of strategies across multiple tokens with concurrency and cooldowns.
 */
export declare class StrategyCoordinator extends EventEmitter {
    private maxConcurrent;
    private cooldownMs;
    private activeTokens;
    private cooldowns;
    private queue;
    constructor(options: StrategyCoordinatorOptions);
    /**
     * Call when a new token is discovered or signaled for trading
     */
    enqueueToken(token: string): void;
    /**
     * Call when a token's trade completes (to start cooldown)
     */
    completeToken(token: string): void;
    private isOnCooldown;
    private tryDispatch;
    /**
     * For testing: get current queue and active tokens
     */
    getStatus(): {
        active: string[];
        queue: string[];
        cooldowns: string[];
    };
}
//# sourceMappingURL=StrategyCoordinator.d.ts.map