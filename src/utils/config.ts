// src/utils/config.ts
import dotenv from 'dotenv';
import { RiskLevel as RiskLevelType } from './contractValidator.js';

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];
import path from 'path';
import { Cluster, PublicKey } from '@solana/web3.js';

// Load environment variables from .env file
dotenv.config();

// Helper function to get environment variables with type conversion
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return defaultValue;
  }
  return value;
}

function getEnvAsNumber(key: string, defaultValue?: number): number {
  const value = getEnv(key, defaultValue !== undefined ? String(defaultValue) : undefined);
  const numberValue = Number(value);
  if (isNaN(numberValue)) {
    throw new Error(`Invalid number format for environment variable: ${key}`);
  }
  return numberValue;
}

function getEnvAsBoolean(key: string, defaultValue?: boolean): boolean {
  const value = getEnv(
    key,
    defaultValue !== undefined ? String(defaultValue) : undefined,
  ).toLowerCase();
  return value === 'true' || value === '1';
}

function getEnvAsCluster(key: string, defaultValue: Cluster = 'mainnet-beta'): Cluster {
  const value = getEnv(key, defaultValue) as Cluster;
  if (!['mainnet-beta', 'testnet', 'devnet'].includes(value)) {
    throw new Error(`Invalid cluster value for environment variable: ${key}`);
  }
  return value;
}

function getRiskLevel(key: string, defaultValue: RiskLevel): RiskLevel {
  const value = getEnv(key, defaultValue.toString()).toUpperCase();

  if (value === 'LOW') return RiskLevel.LOW;
  if (value === 'MEDIUM') return RiskLevel.MEDIUM;
  if (value === 'HIGH') return RiskLevel.HIGH;
  if (value === 'CRITICAL') return RiskLevel.CRITICAL;

  return defaultValue;
}

// Define and export the structure of the configuration object
export interface Config {


  /**
   * If true, the bot will simulate trades (no live orders sent).
   */
  trading: {
    /**
     * Threshold for pump detection (custom script usage)
     */
    pumpThreshold?: number;
    /**
     * Pump window in seconds (custom script usage)
     */
    pumpWindowSec?: number;
    /**
     * Max hold time in seconds (custom script usage)
     */
    maxHoldSec?: number;
    /**
     * If true, the bot will simulate trades (no live orders sent).
     */
    dryRun?: boolean;
    /**
     * If true, force a buy on mempool event (regardless of pattern filter)
     */
    forcePumpOnMempool?: boolean;
    /**
     * If true, force a buy on whale event (regardless of pattern filter)
     */
    forcePumpOnWhale?: boolean;
    /**
     * Size in SOL for forced pump buys
     */
    forcedPumpSizeSol?: number;
    /**
     * Seconds to wait before executing forced pump
     */
    forcedPumpWaitSec?: number;
    initialBalance: number;
    maxPositionSize: number;
    maxRiskLevel: RiskLevel;
    // --- Automated Trading Criteria ---
    newTokenAgeHours?: number; // Age threshold for new tokens (hours)
    newVolumeSpikePercent?: number; // Volume spike % for new tokens
    newBuyRatio?: number; // Buy ratio for new tokens
    newMinLiquidity?: number; // Min liquidity for new tokens
    establishedTokenAgeHours?: number; // Age threshold for established tokens (hours)
    establishedVolumeSpikePercent?: number; // Volume spike % for established tokens
    establishedBuyRatio?: number; // Buy ratio for established tokens
    establishedMinLiquidity?: number; // Min liquidity for established tokens
    priceChangePercentNew?: number; // Price change % for new tokens
    priceChangePercentEstablished?: number; // Price change % for established tokens
    // --- Custom Trading Parameters ---
    priceChangeThreshold?: number;
    volumeMultiplier?: number;
    riskPct?: number;
    // --- Position Management ---
    maxPositions?: number; // Max open positions
    maxPositionValueUsd?: number; // Max value per position
    maxCashAllocationPercent?: number; // Max % of cash allocated
    ageBasedRiskAdjustment?: boolean; // Enable age-based risk adjustment

    autoSave: boolean;
    dataDirectory: string;
    slippageTolerance: number;
    simulationMode: boolean;
    autoTrade: boolean;
    jupiterSlippageBps: number;
    targetPositionValueUsd: number;
    minPositionValueUsd: number;
    minLiquidity: number;
    maxLiquidityPercentage: number;
    slippageBps: number | undefined;
    maxConcurrentPositions: number | undefined;
    maxPositionSizeUsd: number | undefined;
    txConfirmationTimeoutMs?: number; // Optional: Timeout for transaction confirmation
    txPriorityFeeMicroLamports?: number; // Optional: Priority fee in micro-lamports
  };
  solana: {
    rpcEndpoint: string;
    wssEndpoint: string; // Added WebSocket endpoint
    walletPrivateKey: string;
    usdcMint: string;
    cluster: Cluster;
  };

  notifications: {
    enabled: boolean;
    discordWebhookUrl?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
    telegramApiId?: number;
    telegramApiHash?: string;
    telegramSessionString?: string;
    logLevel: 'info' | 'warn' | 'error' | 'debug';
    notifyLevel?: 'all' | 'trades' | 'errors' | 'patterns' | 'none';
    notifyOnTrade: boolean;
    notifyOnError: boolean;
    notifyOnStart: boolean;
    notifyOnStatusUpdate: boolean;
  };
  risk: {
    maxActivePositions: number;
    maxDailyLossPercent: number;
    maxDrawdownPercent: number;
    volatilityThreshold: number;
    priceDeviationThreshold: number;
    defaultStopLossPercent: number;
    trailingStopEnabled?: boolean;
    trailingStopActivationPercent?: number;
    trailingStopTrailPercent?: number;
    maxPortfolioAllocationPercent?: number;
    maxTradesPerMinute: number;
    maxTradesPerHour: number;
    maxTradesPerDay: number;
    minSuccessRate: number;
  };
  tokenMonitor: {
    minLiquidityUsd: number;
    maxTokenAgeHours: number;
    scanIntervalSeconds: number;
    defaultTimeframe: string;
    wsEndpoint: string;
    reconnectInterval: number;
    maxRetries: number;
    pollingIntervalSeconds: number; // Added for polling detector
    maxSignaturesToStore: number; // Max signatures to keep in processed set
  };
  debug: {
    verbose: boolean;
    logLevel: string;
  };
  sellCriteria: {
    minSellLiquidity: number | undefined;
    minSellBuyRatio: number | undefined;
    stopLossPercent: number | undefined; // Tuned by parameter sweep 2025-07-05
    takeProfitPercent: number | undefined; // Tuned by parameter sweep 2025-07-05
  };
}

/**
 * Bot analytics & notification settings
 */
export interface AnalyticsConfig {
  /**
   * How often to send summary notifications (minutes)
   */
  summaryIntervalMinutes: number;
  /**
   * How far back to look for realized PnL analytics (minutes)
   */
  analyticsWindowMinutes: number;
}

// Default configuration object loading values from environment variables
export const config: Config = {
  trading: {
    pumpThreshold: getEnvAsNumber('PUMP_THRESHOLD', 2),
    pumpWindowSec: getEnvAsNumber('PUMP_WINDOW_SEC', 60),
    maxHoldSec: getEnvAsNumber('MAX_HOLD_SEC', 180),
    dryRun: getEnvAsBoolean('DRY_RUN', false),
    /**
     * If true, force a buy on mempool event (regardless of pattern filter)
     */
    forcePumpOnMempool: getEnvAsBoolean('FORCE_PUMP_ON_MEMPOOL', false),
    /**
     * If true, force a buy on whale event (regardless of pattern filter)
     */
    forcePumpOnWhale: getEnvAsBoolean('FORCE_PUMP_ON_WHALE', false),
    /**
     * Size in SOL for forced pump buys
     */
    forcedPumpSizeSol: getEnvAsNumber('FORCED_PUMP_SIZE_SOL', 0.0005),
    initialBalance: getEnvAsNumber('INITIAL_BALANCE', 10000),
    maxPositionSize: getEnvAsNumber('MAX_POSITION_SIZE', 1000),
    maxRiskLevel: getRiskLevel('MAX_RISK_LEVEL', RiskLevel.MEDIUM),
    // --- Automated Trading Criteria (Profitability Tuned) ---
    newTokenAgeHours: 12, // Only consider tokens < 12h old as "new"
    newVolumeSpikePercent: 50, // Require at least 50% volume spike for new tokens
    newBuyRatio: 1.2, // Require buy ratio > 1.2 for new tokens
    newMinLiquidity: 50000, // Minimum $50k liquidity for new tokens
    establishedTokenAgeHours: 24, // Consider tokens > 24h as established
    establishedVolumeSpikePercent: 100, // Require at least 100% volume spike for established
    establishedBuyRatio: 1.3, // Require buy ratio > 1.3 for established
    establishedMinLiquidity: 100000, // Minimum $100k liquidity for established
    priceChangePercentNew: 1, // Require at least 1% price change for new tokens
    priceChangePercentEstablished: 2, // Require at least 2% price change for established
    // --- Custom Trading Parameters ---
    priceChangeThreshold: getEnvAsNumber('PRICE_CHANGE_THRESHOLD', 2),
    volumeMultiplier: getEnvAsNumber('VOLUME_MULTIPLIER', 1.5),
    riskPct: getEnvAsNumber('RISK_PCT', 1),
    // --- Position Management ---
    maxPositions: getEnvAsNumber('MAX_POSITIONS', 3), // Max 3 open positions
    maxPositionValueUsd: getEnvAsNumber('MAX_POSITION_VALUE_USD', 50), // $50 per position
    maxCashAllocationPercent: getEnvAsNumber('MAX_CASH_ALLOCATION_PERCENT', 50), // Max 50% of cash
    ageBasedRiskAdjustment: getEnvAsBoolean('AGE_BASED_RISK_ADJUSTMENT', true),

    autoSave: getEnvAsBoolean('AUTO_SAVE', true),
    dataDirectory: getEnv('DATA_DIRECTORY', './data'),
    slippageTolerance: getEnvAsNumber('SLIPPAGE_TOLERANCE', 1),
    simulationMode: getEnvAsBoolean('SIMULATION_MODE', true),
    autoTrade: getEnvAsBoolean('AUTO_TRADE', true),
    jupiterSlippageBps: getEnvAsNumber('JUPITER_SLIPPAGE_BPS', 50),
    targetPositionValueUsd: getEnvAsNumber('TARGET_POSITION_VALUE_USD', 50),
    minPositionValueUsd: getEnvAsNumber('MIN_POSITION_VALUE_USD', 10),
    minLiquidity: getEnvAsNumber('MIN_LIQUIDITY', 50000), // $50k min for any trade
    maxLiquidityPercentage: getEnvAsNumber('MAX_LIQUIDITY_PERCENTAGE', 0.05), // 5% max per pool
    slippageBps: getEnvAsNumber('SLIPPAGE_BPS', 50), // 0.5% slippage default
    maxConcurrentPositions: getEnvAsNumber('MAX_CONCURRENT_POSITIONS', 3),
    maxPositionSizeUsd: getEnvAsNumber('MAX_POSITION_SIZE_USD', 50),
    txConfirmationTimeoutMs: getEnvAsNumber('TRANSACTION_CONFIRMATION_TIMEOUT_MS', 20000),
    txPriorityFeeMicroLamports: getEnvAsNumber('TRANSACTION_PRIORITY_FEE_MICRO_LAMPORTS', 10000),
  },
  solana: {
    rpcEndpoint: getEnv('QUICKNODE_RPC_URL', 'https://api.mainnet-beta.solana.com'),
    // WebSocket endpoint: prefer SOLANA_WSS_ENDPOINT, fallback to QUICKNODE_WSS_URL
    wssEndpoint: getEnv('SOLANA_WSS_ENDPOINT', getEnv('QUICKNODE_WSS_URL', '')),
    walletPrivateKey: getEnv('SOLANA_PRIVATE_KEY', ''),
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    cluster: getEnvAsCluster('SOLANA_CLUSTER', 'mainnet-beta'),
  },
  apis: {
    quicknodeRpcUrl: getEnv('QUICKNODE_RPC_URL', '') || undefined,
    // Existing fields remain unchanged
    quicknodeWssUrl: getEnv('QUICKNODE_WSS_URL', '') || undefined,
    coingeckoApiKey: getEnv('COINGECKO_API_KEY', '') || undefined,
    jupiterQuoteIntervalMs: getEnvAsNumber('JUPITER_QUOTE_INTERVAL_MS', 1500), // interval in ms between Jupiter quote requests
  },
  notifications: {
    enabled: getEnvAsBoolean('NOTIFICATIONS_ENABLED', true),
    discordWebhookUrl: getEnv('DISCORD_WEBHOOK_URL', '') || undefined,
    telegramBotToken: getEnv('TELEGRAM_BOT_TOKEN', '') || undefined,
    telegramChatId: getEnv('TELEGRAM_CHAT_ID', '') || undefined,
    telegramApiId: getEnvAsNumber('TELEGRAM_API_ID', 0) || undefined,
    telegramApiHash: getEnv('TELEGRAM_API_HASH', '') || undefined,
    telegramSessionString: getEnv('TELEGRAM_SESSION_STRING', '') || undefined,
    logLevel: getEnv('LOG_LEVEL', 'info') as 'info' | 'warn' | 'error' | 'debug',
    notifyLevel: getEnv('NOTIFY_LEVEL', 'all') as any,
    notifyOnTrade: getEnvAsBoolean('NOTIFY_ON_TRADE', true),
    notifyOnError: getEnvAsBoolean('NOTIFY_ON_ERROR', true),
    notifyOnStart: getEnvAsBoolean('NOTIFY_ON_START', true),
    notifyOnStatusUpdate: getEnvAsBoolean('NOTIFY_ON_STATUS', false),
  },
  risk: {
    maxActivePositions: getEnvAsNumber('MAX_ACTIVE_POSITIONS'),
    maxDailyLossPercent: getEnvAsNumber('MAX_DAILY_LOSS_PERCENT'),
    maxDrawdownPercent: getEnvAsNumber('MAX_DRAWDOWN_PERCENT'),
    volatilityThreshold: getEnvAsNumber('VOLATILITY_THRESHOLD'),
    defaultStopLossPercent: 1, // Tuned by parameter sweep 2025-07-05
    priceDeviationThreshold: getEnvAsNumber('PRICE_DEVIATION_THRESHOLD', 10),
    maxTradesPerMinute: getEnvAsNumber('MAX_TRADES_PER_MINUTE', 10),
    maxTradesPerHour: getEnvAsNumber('MAX_TRADES_PER_HOUR', 100),
    maxTradesPerDay: getEnvAsNumber('MAX_TRADES_PER_DAY', 1000),
    minSuccessRate: getEnvAsNumber('MIN_SUCCESS_RATE', 50),
  },
  tokenMonitor: {
    minLiquidityUsd: getEnvAsNumber('MIN_LIQUIDITY_USD', 5000),
    maxTokenAgeHours: getEnvAsNumber('MAX_TOKEN_AGE_HOURS', 24),
    scanIntervalSeconds: getEnvAsNumber('SCAN_INTERVAL_SECONDS', 60),
    defaultTimeframe: getEnv('DEFAULT_TIMEFRAME', '5m'),
    wsEndpoint: getEnv('WS_URL', 'wss://public-api.birdeye.so/socket'),
    reconnectInterval: getEnvAsNumber('WS_RECONNECT_DELAY', 5000),
    maxRetries: getEnvAsNumber('WS_RECONNECT_ATTEMPTS', 5),
    pollingIntervalSeconds: getEnvAsNumber('POLLING_INTERVAL_SECONDS', 30),
    maxSignaturesToStore: getEnvAsNumber('MAX_SIGNATURES_TO_STORE', 10000),
  },
  debug: {
    verbose: getEnvAsBoolean('DEBUG', false),
    logLevel: getEnv('LOG_LEVEL', 'info'),
  },
  sellCriteria: {
    minSellLiquidity: getEnvAsNumber('MIN_SELL_LIQUIDITY'),
    minSellBuyRatio: getEnvAsNumber('MIN_SELL_BUY_RATIO'),
    stopLossPercent: getEnvAsNumber('STOP_LOSS_PERCENT', 1), // Tuned by parameter sweep 2025-07-05
    takeProfitPercent: getEnvAsNumber('TAKE_PROFIT_PERCENT', 1), // Tuned by parameter sweep 2025-07-05
  },
};

// --- Analytics/Notification Config ---
export const analyticsConfig: AnalyticsConfig = {
  summaryIntervalMinutes: getEnvAsNumber('SUMMARY_INTERVAL_MINUTES', 120),
  analyticsWindowMinutes: getEnvAsNumber('ANALYTICS_WINDOW_MINUTES', 120),
};

export function validateConfig(config: Config): void {
  // Validate QuickNode URLs if they are intended to be primary
  // Depending on usage, these might become required later
  if (!config.apis.quicknodeRpcUrl) {
    console.warn(
      'QUICKNODE_RPC_URL is not set. Ensure SOLANA_RPC_URL is reliable or evaluation/trading might fail.',
    );
  }
  if (!config.apis.quicknodeWssUrl) {
    console.warn(
      'QUICKNODE_WSS_URL is not set. WebSocket detection will rely on Helius or other methods if configured, or fail.',
    );
  }
  if (
    !config.solana.rpcEndpoint ||
    config.solana.rpcEndpoint === 'https://api.mainnet-beta.solana.com'
  ) {
    throw new Error(
      'Missing or default QUICKNODE_RPC_URL in configuration. Please set it in .env.',
    );
  }
  if (!config.solana.wssEndpoint) {
    throw new Error('Missing QUICKNODE_WSS_URL in configuration. Please set it in .env.');
  }
  if (!config.solana.walletPrivateKey && !config.trading.simulationMode) {
    // Only require private key if not in simulation mode
    throw new Error('Missing SOLANA_PRIVATE_KEY in configuration for live trading.');
  }
  // Add checks for other critical fields...
}

// Ensure config is validated on import (optional, good practice)
// try {
//   validateConfig(config);
// } catch (error: any) {
//   console.error(`Configuration validation failed: ${error.message}`);
//   process.exit(1);
// }
