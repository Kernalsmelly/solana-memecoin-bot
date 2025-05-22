import { EventEmitter } from 'events';
import { BirdeyeAPI } from '../api/birdeyeAPI';
import { AnalyzedToken } from '../analysis/tokenAnalyzer';
export interface TokenDiscoveryOptions {
    minLiquidity?: number;
    minVolume?: number;
    cleanupIntervalMs?: number;
    maxTokenAge?: number;
    analysisThrottleMs?: number;
}
export interface RiskManager {
    [key: string]: any;
}
export declare class TokenDiscovery extends EventEmitter {
    private birdeyeAPI;
    private tokenAnalyzer;
    private riskManager?;
    private tokensDiscovered;
    private tokenProcessQueue;
    private tokenExpiryTimes;
    private cleanupInterval;
    private processingQueue;
    private lastAnalysisTime;
    private MIN_LIQUIDITY;
    private MIN_VOLUME;
    private CLEANUP_INTERVAL_MS;
    private TOKEN_MAX_AGE_MS;
    private ANALYSIS_THROTTLE_MS;
    constructor(birdeyeAPI: BirdeyeAPI, options?: TokenDiscoveryOptions, riskManager?: RiskManager);
    private setupEventListeners;
    start(): Promise<boolean>;
    stop(): void;
    private handleTokenEvent;
    private processTokenQueue;
    private processNewToken;
    private startCleanupInterval;
    private cleanupExpiredTokens;
    private runGarbageCollection;
    getTokenCount(): number;
    getToken(address: string): AnalyzedToken | undefined;
    getAllTokens(): AnalyzedToken[];
    destroy(): void;
}
declare global {
    interface Global {
        gc?: () => void;
    }
}
//# sourceMappingURL=tokenDiscovery.d.ts.map