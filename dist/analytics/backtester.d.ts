import { Connection } from '@solana/web3.js';
import { PatternType } from '../types';
interface BacktestConfig {
    tokenAddress: string;
    startTimestamp: number;
    endTimestamp: number;
    patternTypes?: PatternType[];
    connection: Connection;
    priceDataPath?: string;
    saveResults?: boolean;
}
interface PatternBacktestResult {
    patternName: PatternType;
    detectionCount: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    avgReturn: number;
    maxReturn: number;
    maxDrawdown: number;
    avgHoldingTimeHours: number;
    profitFactor: number;
    trades: {
        timestamp: number;
        entryPrice: number;
        exitPrice: number;
        holdingTimeHours: number;
        pnlPercent: number;
        exitReason: string;
    }[];
}
/**
 * Pattern Backtester
 * Tests pattern detection strategies against historical price data
 */
export declare class PatternBacktester {
    private config;
    private priceData;
    private patternDetector;
    private results;
    private defaultStopLossPercent;
    private defaultTakeProfitPercent;
    private defaultMaxHoldingTimeHours;
    constructor(config: BacktestConfig);
    /**
     * Load historical price data
     */
    loadPriceData(): Promise<boolean>;
    /**
     * Run backtest for all selected patterns
     */
    runBacktest(): Promise<Record<PatternType, PatternBacktestResult>>;
    /**
     * Create a simulated token for pattern detection
     */
    private createSimulatedToken;
    private calculateVolumeChange;
    /**
     * Detect patterns based on current market state
     */
    private detectPatterns;
    /**
     * Simulate pattern confidence calculation
     */
    private simulatePatternConfidence;
    /**
     * Simulate trade execution and tracking
     */
    private simulateTrade;
    /**
     * Calculate final backtest results
     */
    calculateResults(): void;
    /**
     * Save backtest results to file
     */
    private saveResults;
    /**
     * Get summary of backtest results
     */
    getResultsSummary(): any;
}
export default PatternBacktester;
//# sourceMappingURL=backtester.d.ts.map