import { ExitManager, ManagedPosition } from './exitManager';
import { RiskManager } from '../live/riskManager';
import { PatternType, PatternDetection } from '../types';
import { OrderExecution } from '../types';
import { BirdeyeAPI } from '../api/birdeyeAPI';
interface PortfolioDependencies {
    orderExecution: OrderExecution;
    riskManager: RiskManager;
    birdeyeApi?: BirdeyeAPI;
    exitManager: ExitManager;
}
interface PortfolioConfig {
    maxPositions: number;
    maxExposurePercent?: number;
    targetPositionValueUsd?: number;
    minPositionValueUsd?: number;
    patternAllocation: Record<PatternType, number>;
    minConfidence: number;
    preferNewTokens: boolean;
    maxPortfolioAllocationPercent?: number;
}
/**
 * Portfolio Optimizer
 * Intelligently allocates capital across different trading patterns
 * to maximize returns while controlling risk
 */
export declare class PortfolioOptimizer {
    private config;
    getMinConfidence(): number;
    private activePositions;
    private patternPerformance;
    constructor(config: Partial<PortfolioConfig> & PortfolioDependencies);
    /**
     * Initialize pattern performance tracking
     */
    private initializePatternPerformance;
    /**
     * Calculate the position size in SOL lamports based on risk management and pattern.
     */
    private calculatePositionSizeLamports;
    /**
     * Process new pattern detection for portfolio consideration
     * Returns the ManagedPosition if a buy order is successfully executed, otherwise null.
     */
    evaluatePattern(patternDetection: PatternDetection): Promise<ManagedPosition | null>;
    /**
     * Handle position exit to update performance metrics
     */
    handlePositionExit(positionId: string, pnlPercent?: number, reason?: string): void;
    /**
     * Update performance metrics for a given pattern based on a closed trade's PNL.
     */
    private updatePatternPerformance;
    /**
     * Check if we can add a new position (async due to exposure check)
     */
    private canAddPosition;
    /**
     * Get current portfolio exposure in SOL.
     * Assumes position.initialSolCostLamports stores the initial investment.
     */
    private getCurrentExposureSol;
    /**
     * Get all active positions
     */
    getActivePositions(): ManagedPosition[];
    /**
     * Get pattern performance metrics
     */
    getPatternPerformance(): Record<PatternType, any>;
    /**
     * Update portfolio configuration
     */
    updateConfig(config: Partial<PortfolioConfig>): void;
    /**
     * Placeholder: Evaluate a token and decide whether to buy.
     * TODO: Implement actual vetting and buying logic.
     */
    evaluateAndBuy(tokenInfo: any): Promise<ManagedPosition | null>;
    /**
     * Placeholder: Handle notification that a position was closed.
     * TODO: Implement logic to update internal state/metrics.
     */
    handlePositionClosure(tokenAddress: string): void;
    private initializePatternAllocation;
}
export {};
//# sourceMappingURL=portfolioOptimizer.d.ts.map