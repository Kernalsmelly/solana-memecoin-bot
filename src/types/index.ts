import { PublicKey } from '@solana/web3.js';

export type PatternType = 
    | 'Mega Pump and Dump'
    | 'Volatility Squeeze'
    | 'Smart Money Trap'
    | 'Algorithmic Stop Hunt'
    | 'Smart Money Reversal'
    | 'Volume Divergence'
    | 'Hidden Accumulation'
    | 'Wyckoff Spring'
    | 'Liquidity Grab'
    | 'FOMO Cycle';

export interface TokenMetrics {
    address: string;
    poolAddress: string; 
    name?: string; 
    symbol: string;
    priceUsd: number; 
    liquidity: number;
    volume24h?: number; 
    priceChange24h?: number; 
    marketCap?: number; 
    holders: number;
    buys5min: number;
    decimals?: number;
    timestamp: number;
    ageHours?: number; 
    source?: string; 
    signature?: string; 
    slot?: number; 
    quoteTokenMint?: string; 
    score?: number; 
    pumpPotential?: number; 
}

export interface PatternDetection {
    tokenAddress: string;
    pattern: string;
    confidence: number;
    timestamp: number;
    metrics: TokenMetrics;
}

export interface TradingSignal {
    tokenAddress: string;
    price: number;
    stopLoss: number;
    positionSize: number;
    confidence: number;
    timestamp: number;
    timeframe: string;
    signalType: 'buy' | 'sell';
}

export interface Position {
    id: string;
    tokenAddress: string;
    tokenSymbol: string;
    tokenMint: PublicKey;
    tokenDecimals: number;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    size: number;
    stopLoss: number;
    takeProfit: number;
    pnl: number;
    status: 'open' | 'closed';
    timestamp: number;
}

export interface RiskMetrics {
    currentBalance: number;
    dailyPnL: number;
    drawdown: number;
    winRate: number;
    activePositions: number;
    availablePositions: number;
    highWaterMark: number;
    dailyLoss: number;
    dailyStartBalance?: number;
    circuitBreakers?: Record<string, boolean>;
    emergencyStopActive?: boolean;
    systemEnabled?: boolean;
    successRate?: number;
    pnl?: number;
    tradeCount?: {
        minute: number;
        hour: number;
        day: number;
    };
}

export interface TradingState {
    positions: Position[];
    riskMetrics: RiskMetrics;
    timestamp: number;
}

export interface TradeHistoryEntry {
    timestamp: number;
    position: Position;
    action: 'open' | 'close' | 'adjust';
    price: number;
    size: number;
    pnl?: number;
}

/**
 * Represents a trade order to be executed.
 */
export interface TradeOrder {
    side: 'buy' | 'sell';       // The side of the trade
    tokenAddress: string;       // The mint address of the token
    size: bigint | number;      // Amount in lamports (for SOL buys) or smallest token units (for sells)
    price: number;              // The price at which the order should ideally execute (or was observed)
    stopLoss?: number;           // Optional stop-loss price
    timestamp: number;          // Timestamp of order creation/evaluation
}

export interface OrderExecutionResult {
    success: boolean;
    txSignature?: string;
    inputAmount?: bigint; // Amount of input token used in swap
    outputAmount?: bigint; // Amount of output token received
    actualExecutionPrice?: number; // Price at which the swap executed
    error?: string;
    timestamp: number;
}

export interface RugAnalysis {
    tokenAddress: string;
    liquidity: number;
    holders: number;
    buyTax: number;
    sellTax: number;
    isHoneypot: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    issues: string[];
    timestamp: number;
}

export interface RiskManagerConfig {
    maxDrawdown: number;
    maxDailyLoss: number;
    maxPositions: number;
    maxPositionSize: number;
    maxPositionValueUsd?: number;
    slippageBps?: number;
    maxVolatility?: number;
    maxPriceDeviation?: number;
    volWindow?: number;
    maxTradesPerMinute?: number;
    maxTradesPerHour?: number;
    maxTradesPerDay?: number;
    maxExecutionTime?: number;
    minSuccessRate?: number;
    emergencyStopThreshold?: number;
}
