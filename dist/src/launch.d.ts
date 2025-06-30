declare class RpcRateLimiter {
    private static instance;
    private rpcCallCount;
    private rpcCallResetTime;
    private readonly MAX_RPC_CALLS_PER_MINUTE;
    private constructor();
    static getInstance(): RpcRateLimiter;
    checkLimit(): boolean;
    getUtilizationPercent(): number;
    getCurrentCount(): number;
    getMaxCount(): number;
}
export declare const globalRateLimiter: RpcRateLimiter;
export {};
//# sourceMappingURL=launch.d.ts.map