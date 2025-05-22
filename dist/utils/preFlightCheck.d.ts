interface PreFlightCheckResult {
    pass: boolean;
    criticalIssues: string[];
    warnings: string[];
    recommendations: string[];
    metrics: {
        systemMemory: {
            total: number;
            free: number;
            percentFree: number;
        };
        systemCpu: {
            cores: number;
            load: number[];
        };
        networkLatency: {
            rpc: number;
            birdeyeApi: number | null;
        };
        walletStatus: {
            solBalance: number;
            usdcBalance: number;
            totalValueUsd: number;
        };
    };
}
/**
 * Comprehensive pre-flight check before live trading
 * Validates all system components, configuration, and environment
 */
export declare function runPreFlightCheck(): Promise<PreFlightCheckResult>;
export default runPreFlightCheck;
//# sourceMappingURL=preFlightCheck.d.ts.map