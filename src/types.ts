// src/types.ts

// Action type for trade actions
export type Action = 'buy' | 'sell' | 'skip';

// PatternType: All supported pattern strings
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
  | 'FOMO Cycle'
  | 'Volatility Breakout'
  | 'Mean Reversion';

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

// Alias for compatibility
export type DetectedPattern = PatternMatch;

export interface TradeOrder {
  tokenAddress: string; // Used in orderExecution.ts
  side: 'buy' | 'sell';
  size: number | bigint; // Used in orderExecution.ts
  price?: number;
  // For compatibility with older code, keep optional aliases:
  tokenMint?: string;
  amount?: number | bigint;
  // Add additional fields as needed
}

export interface OrderExecutionResult {
  success: boolean;
  txSignature?: string;
  inputAmount?: number | bigint;
  outputAmount?: number | bigint;
  actualExecutionPrice?: number;
  timestamp?: number;
  error?: string; // Optional error message for failed results
  // Add additional fields as needed
}

export interface OrderExecution {
  executeOrder(order: TradeOrder): Promise<OrderExecutionResult>;
  // Optional: for test/mocks
  getTokenDecimals?(tokenAddress: string): Promise<number>;
  // Add additional methods as needed
}

// Minimal RugAnalysis type for compatibility
export interface RugAnalysis {
  [key: string]: any;
}

// Minimal TokenMetrics type for compatibility
export interface TokenMetrics {
  [key: string]: any;
}

// Minimal PatternDetection type for compatibility
export interface PatternDetection {
  [key: string]: any;
}

// Shared Position type for trading, paper trading, and position management
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
  trades?: Array<any>; // For trade history, can be refined later
  [key: string]: any; // Allow extension for custom fields
}

// Minimal TradingSignal type for compatibility
export interface TradingSignal {
  [key: string]: any;
}

// TradeHistoryEntry for trade history logging
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

// TradingState for persistence and state management
export interface TradingState {
  positions: Position[];
  riskMetrics: RiskMetrics;
  allocatedCash: number;
  totalValue: number;
  [key: string]: any; // extensibility
}

// Minimal RiskMetrics type for compatibility
export interface RiskMetrics {
  maxDrawdown?: number;
  maxDailyLoss?: number;
  activePositions?: number;
  pnl?: number;
  [key: string]: any;
}
