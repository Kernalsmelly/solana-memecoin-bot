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
// Trading system configuration
exports.config = {
    trading: {
        initialBalance: getEnvAsNumber('INITIAL_BALANCE', 10000),
        maxPositionSize: getEnvAsNumber('MAX_POSITION_SIZE', 1000),
        maxRiskLevel: getRiskLevel('MAX_RISK_LEVEL', contractValidator_1.RiskLevel.MEDIUM),
        autoSave: getEnvAsBoolean('AUTO_SAVE', true),
        dataDirectory: getEnv('DATA_DIRECTORY', './data'),
        slippageTolerance: getEnvAsNumber('SLIPPAGE_TOLERANCE', 1)
    },
    apis: {
        birdeyeApiKey: getEnv('BIRDEYE_API_KEY', ''),
        coingeckoApiKey: getEnv('COINGECKO_API_KEY', '')
    },
    debug: {
        enabled: getEnvAsBoolean('DEBUG', false),
        logLevel: getEnv('LOG_LEVEL', 'info')
    }
};
exports.default = exports.config;
