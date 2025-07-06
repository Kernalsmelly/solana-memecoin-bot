"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsConfig = exports.config = void 0;
exports.validateConfig = validateConfig;
// src/utils/config.ts
const dotenv_1 = __importDefault(require("dotenv"));
const contractValidator_1 = require("../contractValidator");
// Load environment variables from .env file
dotenv_1.default.config();
// Helper function to get environment variables with type conversion
function getEnv(key, defaultValue) {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue === undefined) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
        return defaultValue;
    }
    return value;
}
function getEnvAsNumber(key, defaultValue) {
    const value = getEnv(key, defaultValue !== undefined ? String(defaultValue) : undefined);
    const numberValue = Number(value);
    if (isNaN(numberValue)) {
        throw new Error(`Invalid number format for environment variable: ${key}`);
    }
    return numberValue;
}
function getEnvAsBoolean(key, defaultValue) {
    const value = getEnv(key, defaultValue !== undefined ? String(defaultValue) : undefined).toLowerCase();
    return value === 'true' || value === '1';
}
function getEnvAsCluster(key, defaultValue = 'mainnet-beta') {
    const value = getEnv(key, defaultValue);
    if (!['mainnet-beta', 'testnet', 'devnet'].includes(value)) {
        throw new Error(`Invalid cluster value for environment variable: ${key}`);
    }
    return value;
}
function getRiskLevel(key, defaultValue) {
    const value = getEnv(key, defaultValue.toString()).toUpperCase();
    if (value === 'LOW')
        return contractValidator_1.RiskLevel.LOW;
    if (value === 'MEDIUM')
        return contractValidator_1.RiskLevel.MEDIUM;
    if (value === 'HIGH')
        return contractValidator_1.RiskLevel.HIGH;
    if (value === 'CRITICAL')
        return contractValidator_1.RiskLevel.CRITICAL;
    return defaultValue;
}
// Default configuration object loading values from environment variables
exports.config = {
    trading: {
        initialBalance: getEnvAsNumber('INITIAL_BALANCE', 10000),
        maxPositionSize: getEnvAsNumber('MAX_POSITION_SIZE', 1000),
        maxRiskLevel: getRiskLevel('MAX_RISK_LEVEL', contractValidator_1.RiskLevel.MEDIUM),
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
        quicknodeWssUrl: getEnv('QUICKNODE_WSS_URL', '') || undefined,
        coingeckoApiKey: getEnv('COINGECKO_API_KEY', '') || undefined,
    },
    notifications: {
        enabled: getEnvAsBoolean('NOTIFICATIONS_ENABLED', true),
        discordWebhookUrl: getEnv('DISCORD_WEBHOOK_URL', '') || undefined,
        telegramBotToken: getEnv('TELEGRAM_BOT_TOKEN', '') || undefined,
        telegramChatId: getEnv('TELEGRAM_CHAT_ID', '') || undefined,
        telegramApiId: getEnvAsNumber('TELEGRAM_API_ID', 0) || undefined,
        telegramApiHash: getEnv('TELEGRAM_API_HASH', '') || undefined,
        telegramSessionString: getEnv('TELEGRAM_SESSION_STRING', '') || undefined,
        logLevel: getEnv('LOG_LEVEL', 'info'),
        notifyLevel: getEnv('NOTIFY_LEVEL', 'all'),
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
        minSuccessRate: getEnvAsNumber('MIN_SUCCESS_RATE', 50)
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
        maxSignaturesToStore: getEnvAsNumber('MAX_SIGNATURES_TO_STORE', 10000)
    },
    debug: {
        verbose: getEnvAsBoolean('DEBUG', false),
        logLevel: getEnv('LOG_LEVEL', 'info')
    },
    sellCriteria: {
        minSellLiquidity: getEnvAsNumber('MIN_SELL_LIQUIDITY'),
        minSellBuyRatio: getEnvAsNumber('MIN_SELL_BUY_RATIO'),
        stopLossPercent: getEnvAsNumber('STOP_LOSS_PERCENT', 1), // Tuned by parameter sweep 2025-07-05
        takeProfitPercent: getEnvAsNumber('TAKE_PROFIT_PERCENT', 1) // Tuned by parameter sweep 2025-07-05
    }
};
// --- Analytics/Notification Config ---
exports.analyticsConfig = {
    summaryIntervalMinutes: getEnvAsNumber('SUMMARY_INTERVAL_MINUTES', 120),
    analyticsWindowMinutes: getEnvAsNumber('ANALYTICS_WINDOW_MINUTES', 120)
};
function validateConfig(config) {
    // Validate QuickNode URLs if they are intended to be primary
    // Depending on usage, these might become required later
    if (!config.apis.quicknodeRpcUrl) {
        console.warn('QUICKNODE_RPC_URL is not set. Ensure SOLANA_RPC_URL is reliable or evaluation/trading might fail.');
    }
    if (!config.apis.quicknodeWssUrl) {
        console.warn('QUICKNODE_WSS_URL is not set. WebSocket detection will rely on Helius or other methods if configured, or fail.');
    }
    if (!config.solana.rpcEndpoint || config.solana.rpcEndpoint === 'https://api.mainnet-beta.solana.com') {
        throw new Error('Missing or default QUICKNODE_RPC_URL in configuration. Please set it in .env.');
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
//# sourceMappingURL=config.js.map