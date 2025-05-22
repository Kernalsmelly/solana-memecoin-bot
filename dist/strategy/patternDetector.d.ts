import { EventEmitter } from 'events';
import { TokenDiscovery } from '../discovery/tokenDiscovery';
import { RiskManager } from '../live/riskManager';
import { PatternType } from '../types';
export interface PatternDetectorConfig {
    tokenDiscovery: TokenDiscovery;
    riskManager: RiskManager;
    maxTokenAge?: number;
    minLiquidity?: number;
    maxPositionValue?: number;
    enabledPatterns?: PatternType[];
}
export interface PatternCriteria {
    priceChangeMin: number;
    volumeChangeMin: number;
    buyRatioMin: number;
    liquidityMin: number;
    ageMax?: number;
    holdersMin?: number;
}
export interface PatternMatch {
    pattern: PatternType;
    confidence: number;
    signalType: 'buy' | 'sell';
}
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
    /**
     * Analyze token metrics to detect patterns
     */
    private analyzePatternMatch;
    /**
     * Calculate position size based on token price and risk parameters
     */
    calculatePositionSize(tokenPrice: number): number;
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