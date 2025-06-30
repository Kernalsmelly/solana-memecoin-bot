import { TokenMetrics, PatternDetection } from './types';
import { EventEmitter } from 'events';
export declare class TokenMonitor extends EventEmitter {
    private tokens;
    private patterns;
    constructor();
    addToken(metrics: TokenMetrics): Promise<void>;
    updateToken(metrics: TokenMetrics): Promise<void>;
    addPattern(pattern: PatternDetection): Promise<void>;
    getToken(address: string): TokenMetrics | undefined;
    getPattern(address: string): PatternDetection | undefined;
    getAllTokens(): TokenMetrics[];
    getAllPatterns(): PatternDetection[];
    clearOldData(maxAge?: number): void;
}
//# sourceMappingURL=tokenMonitor.d.ts.map