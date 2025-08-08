import * as dotenv from 'dotenv';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import bs58 from 'bs58';
import logger from './/logger.js';

// dotenv.config(); // REMOVE THIS - Rely on index.ts loading

// Required environment variables for production
const REQUIRED_ENV_VARS = [
  'SOLANA_PRIVATE_KEY', // Standardized name
  'QUICKNODE_RPC_URL',
  'QUICKNODE_WSS_URL',
  'MAX_POSITION_SIZE',
  'MAX_ACTIVE_POSITIONS',
  'MAX_DAILY_LOSS_PERCENT',
  'MAX_DRAWDOWN_PERCENT',
  'VOLATILITY_THRESHOLD',
  'PRICE_DEVIATION_THRESHOLD',
  'MAX_TRADES_PER_MINUTE',
  'MAX_TRADES_PER_HOUR',
  'MAX_TRADES_PER_DAY',
  'MIN_SUCCESS_RATE',
];

// Recommended environment variables
const RECOMMENDED_ENV_VARS = ['DISCORD_WEBHOOK_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

interface ConfigValidationResult {
  isValid: boolean;
  missingRequired: string[];
  missingRecommended: string[];
  walletStatus: {
    valid: boolean;
    address?: string;
    balance?: number;
    error?: string;
  };
  rpcStatus: {
    valid: boolean;
    latency?: number;
    error?: string;
  };
  riskParameters: {
    valid: boolean;
    issues: string[];
  };
}

async function verifyConfig(): Promise<ConfigValidationResult> {
  const result: ConfigValidationResult = {
    isValid: true,
    missingRequired: [],
    missingRecommended: [],
    walletStatus: { valid: false },
    rpcStatus: { valid: false },
    riskParameters: { valid: true, issues: [] },
  };

  // Check for required environment variables
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      result.missingRequired.push(envVar);
      result.isValid = false;
    }
  }

  // Check for recommended environment variables
  for (const envVar of RECOMMENDED_ENV_VARS) {
    if (!process.env[envVar]) {
      result.missingRecommended.push(envVar);
    }
  }

  // Verify RPC connection
  try {
    const startTime = Date.now();
    const rpcUrl = process.env.QUICKNODE_RPC_URL;
    if (!rpcUrl) {
      throw new Error('QUICKNODE_RPC_URL is not defined in environment variables.');
    }
    const connection = new Connection(rpcUrl, 'confirmed');
    await connection.getVersion(); // Use getVersion() to check connectivity
    const latency = Date.now() - startTime;

    result.rpcStatus = {
      valid: true, // If getVersion() didn't throw, connection is valid
      latency,
    };

    if (latency > 2000) {
      logger.warn(`RPC latency is high: ${latency}ms`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error connecting to RPC';
    logger.error(
      `RPC connection check failed for ${process.env.QUICKNODE_RPC_URL}: ${errorMessage}`,
      {
        errorDetails: error instanceof Error ? error : JSON.stringify(error),
        cause: error instanceof Error && 'cause' in error ? (error as any).cause : 'N/A',
        stack: error instanceof Error ? error.stack : 'N/A',
      },
    );
    result.rpcStatus = {
      valid: false,
      error: errorMessage,
    };
    result.isValid = false;
  }

  // Verify wallet
  try {
    if (process.env.SOLANA_PRIVATE_KEY) {
      console.log(
        '[VERIFY CONFIG DEBUG] Raw SOLANA_PRIVATE_KEY env:',
        process.env.SOLANA_PRIVATE_KEY,
      );
      // Parse JSON array (comma-separated numbers)
      let secretKey: Uint8Array;
      if (process.env.SOLANA_PRIVATE_KEY.includes(',')) {
        // CSV/JSON array format
        secretKey = new Uint8Array(process.env.SOLANA_PRIVATE_KEY.split(',').map(Number));
      } else {
        // Base58 format
        secretKey = bs58.decode(process.env.SOLANA_PRIVATE_KEY);
      }
      console.log(
        '[VERIFY CONFIG DEBUG] SOLANA_PRIVATE_KEY decoded length:',
        secretKey.length,
        'First 8 bytes:',
        Array.from(secretKey).slice(0, 8),
      );
      const wallet = Keypair.fromSecretKey(secretKey);
      const connection = new Connection(process.env.QUICKNODE_RPC_URL || '', 'confirmed');
      // Check SOL balance
      const solBalance = await connection.getBalance(wallet.publicKey);
      result.walletStatus = {
        valid: true,
        address: wallet.publicKey.toString(),
        balance: solBalance / 1e9, // Convert lamports to SOL
      };
      if (solBalance < 0.1 * 1e9) {
        logger.warn('Wallet SOL balance is low. Consider funding for transaction fees.');
      }
    }
  } catch (error) {
    result.walletStatus = {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error validating wallet',
    };
    result.isValid = false;
  }

  // Validate risk parameters
  try {
    const maxPositionSize = Number(process.env.MAX_POSITION_SIZE);
    const maxActivePositions = Number(process.env.MAX_ACTIVE_POSITIONS);
    const maxDailyLossPercent = Number(process.env.MAX_DAILY_LOSS_PERCENT);
    const maxDrawdownPercent = Number(process.env.MAX_DRAWDOWN_PERCENT);

    if (isNaN(maxPositionSize) || maxPositionSize <= 0) {
      result.riskParameters.issues.push('MAX_POSITION_SIZE must be a positive number');
      result.riskParameters.valid = false;
    }

    if (
      isNaN(maxActivePositions) ||
      maxActivePositions <= 0 ||
      !Number.isInteger(maxActivePositions)
    ) {
      result.riskParameters.issues.push('MAX_ACTIVE_POSITIONS must be a positive integer');
      result.riskParameters.valid = false;
    }

    if (isNaN(maxDailyLossPercent) || maxDailyLossPercent <= 0 || maxDailyLossPercent > 100) {
      result.riskParameters.issues.push('MAX_DAILY_LOSS_PERCENT must be between 0 and 100');
      result.riskParameters.valid = false;
    }

    if (isNaN(maxDrawdownPercent) || maxDrawdownPercent <= 0 || maxDrawdownPercent > 100) {
      result.riskParameters.issues.push('MAX_DRAWDOWN_PERCENT must be between 0 and 100');
      result.riskParameters.valid = false;
    }

    if (!result.riskParameters.valid) {
      result.isValid = false;
    }
  } catch (error) {
    result.riskParameters.valid = false;
    result.riskParameters.issues.push(
      error instanceof Error ? error.message : 'Unknown error validating risk parameters',
    );
    result.isValid = false;
  }

  if (!process.env.QUICKNODE_RPC_URL) {
    logger.warn('QUICKNODE_RPC_URL is not configured. RPC calls will fail.');
    result.isValid = false; // Make it invalid
  }
  if (!process.env.QUICKNODE_WSS_URL) {
    logger.warn('QUICKNODE_WSS_URL is not configured. WebSocket detection will fail.');
    result.isValid = false; // Make it invalid
  }

  return result;
}

export default verifyConfig;
