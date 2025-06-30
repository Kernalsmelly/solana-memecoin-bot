import { MockPriceFeed } from './utils/mockPriceFeed';
export declare enum TradeType {
    BUY = "BUY",
    SELL = "SELL"
}
interface PatternHistory {
    volumeSpikes: number[];
    momentumPeaks: number[];
    priceSwings: number[];
    timeInPhase: number;
}
interface Position {
    tokenAddress: string;
    tokenAmount: number;
    usdAmount: number;
    entryPrice: number;
    currentPrice: number;
    lastUpdate: number;
    highestPrice: number;
    trailingStop: number;
    peakMomentum: number;
    partialTakeProfit: {
        level1Taken: boolean;
        level2Taken: boolean;
        level3Taken: boolean;
    };
    recentHighs: number[];
    amount: number;
    pumpPhase: string | undefined;
    profitTaking: {
        level1Taken: boolean;
        level2Taken: boolean;
        level3Taken: boolean;
    };
    patternHistory?: PatternHistory;
}
export interface DetectionResult {
    type: string;
    confidence: number;
    action: 'buy' | 'sell' | 'hold';
    patterns: {
        volumeDryUp: boolean;
        volumeSpikes: number;
        risingVolume: boolean;
        volumeClimaxing: boolean;
        strongMomentum: boolean;
        momentumDivergence: boolean;
        volumeDistribution: boolean;
        peakingVolume: boolean;
        climaxing: boolean;
        tightRange: boolean;
        lowVolatility: boolean;
        confirmed: boolean;
    };
}
export declare class TradeSimulator {
    private tradeHistory;
    private totalTrades;
    private wins;
    private losses;
    private profitSum;
    private profitSquares;
    private maxDrawdown;
    private bestTrade;
    private worstTrade;
    private updateStats;
    private printSummary;
    logMissedOpportunity(token: string, reason: string): void;
    private positions;
    private priceFeed;
    private readonly maxPositionSize;
    private readonly TRAILING_STOP_BASE;
    private readonly MOMENTUM_MULTIPLIER;
    private readonly VOLUME_WEIGHT;
    private readonly PROFIT_STOP_LEVELS;
    private readonly MOMENTUM_THRESHOLDS;
    private readonly VOLUME_THRESHOLDS;
    private readonly PROFIT_PROTECTION;
    private readonly PATTERN_THRESHOLDS;
    private readonly PUMP_THRESHOLDS;
    private readonly SCALING_STRATEGY;
    private position;
    constructor(priceFeed: MockPriceFeed, maxPositionSize: number);
    executeTrade(tokenAddress: string, usdAmount: number, side: 'BUY' | 'SELL'): Promise<boolean>;
    private calculateStopDistance;
    private determinePatternType;
    getPositionValue(tokenAddress: string): number;
    getMaxDrawdown(tokenAddress: string): number;
    getProfitFactor(tokenAddress: string): number;
    getPosition(tokenAddress: string): Position | null;
}
export declare const tradeSimulator: TradeSimulator;
export {};
//# sourceMappingURL=tradeSimulator.d.ts.map