import { PricePoint } from '../utils/mockPriceFeed';
interface MomentumAnalysis {
    signal: 'BUY' | 'SELL' | 'HOLD';
    roc: number;
    volatility: number;
    confidence: number;
    reason: string;
}
interface StrategyConfig {
    volatilityThreshold: number;
    minRocThreshold: number;
    maxVolatilityThreshold: number;
    confidenceThreshold: number;
}
export declare function analyzeMomentum(priceHistory: PricePoint[], currentPrice: number, config?: Partial<StrategyConfig>): Promise<MomentumAnalysis>;
export declare function calculatePositionSize(analysis: MomentumAnalysis, maxPosition: number, availableBalance: number): number;
export declare function calculateStopLoss(currentPrice: number, analysis: MomentumAnalysis): number;
export {};
//# sourceMappingURL=rocMomentum.d.ts.map