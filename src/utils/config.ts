// src/utils/config.ts
import dotenv from 'dotenv';
import { RiskLevel } from '../contractValidator';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Helper function to get environment variables with type conversion
function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvAsNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseFloat(value) : defaultValue;
}

function getEnvAsBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]?.toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

// Parse MAX_RISK_LEVEL from env
function getRiskLevel(key: string, defaultValue: RiskLevel): RiskLevel {
  const value = process.env[key]?.toUpperCase();
  
  if (value === 'LOW') return RiskLevel.LOW;
  if (value === 'MEDIUM') return RiskLevel.MEDIUM;
  if (value === 'HIGH') return RiskLevel.HIGH;
  if (value === 'CRITICAL') return RiskLevel.CRITICAL;
  
  return defaultValue;
}

// Trading system configuration
export const config = {
  trading: {
    initialBalance: getEnvAsNumber('INITIAL_BALANCE', 10000),
    maxPositionSize: getEnvAsNumber('MAX_POSITION_SIZE', 1000),
    maxRiskLevel: getRiskLevel('MAX_RISK_LEVEL', RiskLevel.MEDIUM),
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

export default config;