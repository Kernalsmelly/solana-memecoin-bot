import { EventEmitter } from 'events';
import { PatternDetectorConfig, PatternMatch } from '../types.js';
export type { PatternMatch };
/**
 * Pattern Detector System
 * Analyzes tokens for known trading patterns and generates signals
 */
export declare class PatternDetector extends EventEmitter {
    private tokenDiscovery;
    private riskManager;
    private patternCriteria;
    private maxTokenAge;
    private minLiquidity;
    private maxPositionValue;
    private enabledPatterns;
    constructor(config: PatternDetectorConfig);
    /**
     * Set up event listeners for TokenDiscovery
     */
    private setupEventListeners;
    /**
     * Analyze token for trading patterns
     */
    analyzeTokenForPattern(token: any): PatternMatch | null;
    private analyzePatternMatch;
    /**
     * Start pattern detection
     */
    start(): Promise<boolean>;
    /**
     * Stop pattern detection
     */
    stop(): void;
}
//# sourceMappingURL=patternDetector.d.ts.map