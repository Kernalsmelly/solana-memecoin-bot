import { TokenMetrics } from '../types.js';
/**
 * Scores a token opportunity based on liquidity, volume, volatility, price action, buy ratio, age, and trending/social signals.
 * Returns a numeric score and breakdown.
 */
export interface OpportunityScoreResult {
    score: number;
    breakdown: {
        [key: string]: number;
    };
    reasons: string[];
}
export declare function scoreOpportunity(metrics: TokenMetrics): OpportunityScoreResult;
//# sourceMappingURL=opportunityScorer.d.ts.map