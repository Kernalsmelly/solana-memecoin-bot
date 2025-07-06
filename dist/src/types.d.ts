export type Action = 'buy' | 'sell' | 'skip';
export type PatternType = 'Mega Pump and Dump' | 'Volatility Squeeze' | 'Smart Money Trap' | 'Algorithmic Stop Hunt' | 'Smart Money Reversal' | 'Volume Divergence' | 'Hidden Accumulation' | 'Wyckoff Spring' | 'Liquidity Grab' | 'FOMO Cycle' | 'Volatility Breakout' | 'Mean Reversion';
export interface PatternDetectorConfig {
    tokenDiscovery: any;
    riskManager: any;
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
export type DetectedPattern = PatternMatch;
export interface TradeOrder {
    tokenAddress: string;
    side: 'buy' | 'sell';
    size: number | bigint;
    price?: number;
    tokenMint?: string;
    amount?: number | bigint;
}
export interface OrderExecutionResult {
    success: boolean;
    txSignature?: string;
    inputAmount?: number | bigint;
    outputAmount?: number | bigint;
    actualExecutionPrice?: number;
    timestamp?: number;
    error?: string;
}
export interface OrderExecution {
    executeOrder(order: TradeOrder): Promise<OrderExecutionResult>;
    getTokenDecimals?(tokenAddress: string): Promise<number>;
}
export interface RugAnalysis {
    [key: string]: any;
}
export interface TokenMetrics {
    [key: string]: any;
}
export interface PatternDetection {
    [key: string]: any;
}
export interface Position {
    tokenAddress: string;
    tokenSymbol?: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    size: number;
    stopLoss: number;
    takeProfit: number;
    pnl?: number;
    status?: 'open' | 'closed';
    trades?: Array<any>;
    [key: string]: any;
}
export interface TradingSignal {
    [key: string]: any;
}
export interface TradeHistoryEntry {
    timestamp: number | string;
    action: Action;
    tokenAddress: string;
    tokenSymbol?: string;
    quantity: number;
    price: number;
    pnl?: number;
    [key: string]: any;
}
export interface TradingState {
    positions: Position[];
    riskMetrics: RiskMetrics;
    allocatedCash: number;
    totalValue: number;
    [key: string]: any;
}
export interface RiskMetrics {
    maxDrawdown?: number;
    maxDailyLoss?: number;
    activePositions?: number;
    pnl?: number;
    [key: string]: any;
}
//# sourceMappingURL=types.d.ts.map