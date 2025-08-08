import { EventEmitter } from 'events';
import { OrderExecution } from '../types.js';
import { Position } from '../types.js';
import { RiskManager } from '../live/riskManager.js';
import { BirdeyeAPI } from '../api/birdeyeAPI.js';
import { PatternType } from '../types.js';
interface TrailingStopState {
    percent: number;
    highestPrice: number;
    stopPrice: number;
}
export interface ManagedPosition extends Omit<Position, 'size' | 'quantity'> {
    id: string;
    pattern: PatternType;
    entryTime: number;
    entryTimestamp: number;
    trailingStop?: TrailingStopState;
    initialSolCostLamports?: bigint;
    quantity: bigint;
    exitPrice?: number;
}
export interface ExitRule {
    type: 'time' | 'profit' | 'loss' | 'trailing' | 'volatility';
    value: number;
    multiplier?: number;
    activation?: number;
    description: string;
}
export interface ExitManagerConfig {
    timeBasedExits: {
        maxHoldingTimeHours: number;
        quickProfitMinutes?: number;
        quickProfitThreshold?: number;
    };
    profitExits: {
        takeProfit: number;
        megaProfitExit?: {
            threshold: number;
            lockInPercent: number;
        };
        superProfitExit?: number;
    };
    lossExits: {
        stopLoss: number;
        timeBasedStopAdjustment?: {
            afterMinutes: number;
            newStopPercent: number;
        };
    };
    trailingStops: {
        enabled: boolean;
        activationThreshold: number;
        trailPercent: number;
    };
    volatilityExits: {
        enabled: boolean;
        lookbackPeriods: number;
        stdDevMultiplier: number;
    };
    patternSpecificRules: {
        [patternName: string]: ExitRule[];
    };
}
/**
 * Advanced Exit Strategy Manager
 * Handles position exits based on sophisticated rules including:
 * - Time-based exits
 * - Profit targets
 * - Stop losses
 * - Trailing stops
 * - Volatility-based exits
 * - Pattern-specific exit rules
 */
export declare class ExitManager extends EventEmitter {
    private positions;
    private config;
    private orderExecution;
    private riskManager;
    private birdeyeApi?;
    private priceUpdateInterval;
    private analysisInterval;
    private priceHistory;
    constructor(orderExecution: OrderExecution, riskManager: RiskManager, birdeyeApi?: BirdeyeAPI, config?: Partial<ExitManagerConfig>);
    /**
     * Start monitoring positions for exit signals
     */
    start(): void;
    /**
     * Stop monitoring positions
     */
    stop(): void;
    /**
     * Track a new position
     */
    addPosition(position: ManagedPosition): void;
    /**
     * Remove a tracked position
     */
    removePosition(positionId: string): void;
    /**
     * Get all currently tracked positions
     */
    getPositions(): ManagedPosition[];
    /**
     * Update exit rules for a specific position
     */
    updatePositionExitRules(positionId: string, updates: Partial<ManagedPosition>): ManagedPosition | null;
    /**
     * Manual exit for a position
     */
    exitPosition(positionId: string, reason: string): Promise<boolean>;
    /**
     * Update prices for all tracked positions
     */
    private updatePositionPrices;
    /**
     * Fetches the current price for a token using BirdeyeAPI.
     * Includes basic error handling and logging.
     */
    private _fetchPrice;
    /**
     * Analyze all positions for exit signals
     */
    private analyzePositionsForExits;
    /**
     * Check profit/loss targets and stop loss
     * @returns Exit reason string if triggered, null otherwise
     */
    private checkProfitLossRules;
    /**
     * Check trailing stop loss
     * @returns Exit reason string if triggered, null otherwise
     */
    private checkTrailingStop;
    /**
     * Check time-based exit rules
     * @returns Exit reason string if triggered, null otherwise
     */
    private checkTimeBasedRules;
    /**
     * Check volatility-based exit rules
     * @returns Exit reason string if triggered, null otherwise
     */
    private checkVolatilityRules;
    /**
     * Calculate standard deviation
     */
    private calculateStdDev;
    /**
     * Apply default and pattern-specific rules to set initial SL/TP/Trailing
     * Also activates trailing stop if conditions are met.
     */
    private applyExitRules;
    /**
     * Execute the actual exit order
     * @returns True if exit was successful, false otherwise
     */
    private executeExit;
    /**
     * Send notification about the position exit
     */
    private notifyExit;
    /**
     * Merge default config with user config
     */
    private mergeConfig;
}
export default ExitManager;
//# sourceMappingURL=exitManager.d.ts.map