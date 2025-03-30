"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// src/utils/config.ts
const dotenv_1 = __importDefault(require("dotenv"));
const contractValidator_1 = require("../contractValidator");
// Load environment variables from .env file
dotenv_1.default.config();
// Helper function to get environment variables with type conversion
function getEnv(key, defaultValue) {
    return process.env[key] || defaultValue;
}
function getEnvAsNumber(key, defaultValue) {
    const value = process.env[key];
    return value ? parseFloat(value) : defaultValue;
}
function getEnvAsBoolean(key, defaultValue) {
    const value = process.env[key]?.toLowerCase();
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return defaultValue;
}
// Parse MAX_RISK_LEVEL from env
function getRiskLevel(key, defaultValue) {
    const value = process.env[key]?.toUpperCase();
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
exports.config = {
    trading: {
        initialBalance: getEnvAsNumber('INITIAL_BALANCE', 10000),
        maxPositionSize: getEnvAsNumber('MAX_POSITION_SIZE', 1000),
        maxRiskLevel: getRiskLevel('MAX_RISK_LEVEL', contractValidator_1.RiskLevel.MEDIUM),
        autoSave: getEnvAsBoolean('AUTO_SAVE', true),
        dataDirectory: getEnv('DATA_DIRECTORY', './data'),
        slippageTolerance: getEnvAsNumber('SLIPPAGE_TOLERANCE', 1),
        simulationMode: getEnvAsBoolean('SIMULATION_MODE', true),
        autoTrade: getEnvAsBoolean('AUTO_TRADE', true),
        minLiquidity: getEnvAsNumber('MIN_LIQUIDITY', 5000),
        maxLiquidityPercentage: getEnvAsNumber('MAX_LIQUIDITY_PERCENTAGE', 0.05)
    },
    solana: {
        rpcEndpoint: getEnv('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
        walletPrivateKey: getEnv('WALLET_PRIVATE_KEY', ''),
        usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    },
    apis: {
        birdeyeApiKey: getEnv('BIRDEYE_API_KEY', ''),
        coingeckoApiKey: getEnv('COINGECKO_API_KEY', '')
    },
    tokenMonitor: {
        wsEndpoint: getEnv('WS_URL', 'wss://public-api.birdeye.so/socket'),
        reconnectInterval: getEnvAsNumber('WS_RECONNECT_DELAY', 5000),
        maxRetries: getEnvAsNumber('WS_RECONNECT_ATTEMPTS', 5)
    },
    debug: {
        verbose: getEnvAsBoolean('DEBUG', false),
        logLevel: getEnv('LOG_LEVEL', 'info')
    }
};
exports.default = exports.config;
