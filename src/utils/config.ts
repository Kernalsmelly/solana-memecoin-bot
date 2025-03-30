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

interface Config {
  trading: {
    initialBalance: number;
    maxPositionSize: number;
    maxRiskLevel: RiskLevel;
    autoSave: boolean;
    dataDirectory: string;
    slippageTolerance: number;
    simulationMode: boolean;
    autoTrade: boolean;
    minLiquidity: number;
    maxLiquidityPercentage: number;
  };
  solana: {
    rpcEndpoint: string;
    walletPrivateKey: string;
    usdcMint: string;
  };
  apis: {
    birdeyeApiKey: string;
    coingeckoApiKey: string;
  };
  tokenMonitor: {
    wsEndpoint: string;
    reconnectInterval: number;
    maxRetries: number;
  };
  debug: {
    verbose: boolean;
    logLevel: string;
  };
}

export const config: Config = {
  trading: {
    initialBalance: getEnvAsNumber('INITIAL_BALANCE', 10000),
    maxPositionSize: getEnvAsNumber('MAX_POSITION_SIZE', 1000),
    maxRiskLevel: getRiskLevel('MAX_RISK_LEVEL', RiskLevel.MEDIUM),
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

export default config;