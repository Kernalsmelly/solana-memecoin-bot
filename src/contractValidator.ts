// src/contractValidator.ts

import { Connection, PublicKey } from '@solana/web3.js';
import ConnectionManager from './connectionManager';
import axios, { AxiosError } from 'axios';
import { Redis } from 'ioredis';

/**
 * Enumeration of risk levels.
 */
export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * The result of a contract validation.
 */
export interface RugAnalysis {
  risk: RiskLevel;
  score: number;
  warnings: string;
  timestamp: number;
}

/**
 * Liquidity metrics for the token contract.
 */
export interface LiquidityMetrics {
  locked: boolean;
  totalLiquidity?: number;
}

/**
 * Options for configuring the ContractValidator.
 */
interface ValidatorOptions {
  solscanContractUrl?: string;
  solscanHoldersUrl?: string;
  redisClient?: Redis; // Optional Redis client for caching.
}

/**
 * ContractValidator fetches data about a token contract and produces a risk analysis.
 */
class ContractValidator {
  private solscanContractUrl: string;
  private solscanHoldersUrl: string;
  private redisClient?: Redis;

  constructor(options?: ValidatorOptions) {
    this.solscanContractUrl =
      options?.solscanContractUrl ||
      process.env.SOLSCAN_CONTRACT_URL ||
      'https://public-api.solscan.io/account/export';
    this.solscanHoldersUrl =
      options?.solscanHoldersUrl ||
      process.env.SOLSCAN_HOLDERS_URL ||
      'https://public-api.solscan.io/token/holders';
    this.redisClient = options?.redisClient;
  }

  /**
   * Validates a token contract by fetching its code, holder distribution, and liquidity metrics,
   * then calculates a risk score.
   * Immediately returns CRITICAL risk if contract code is empty.
   * @param address The token contract address.
   * @returns A promise resolving to a RugAnalysis object.
   */
  async validateContract(address: string): Promise<RugAnalysis> {
    try {
      // Retrieve all relevant data concurrently.
      const [code, holderPercent, liquidity] = await Promise.all([
        this.getContractCode(address),
        this.getHolderDistribution(address),
        this.getLiquidityMetrics(address)
      ]);

      // If contract code is empty, consider it a critical risk immediately.
      if (!code || code.trim().length === 0) {
        return {
          risk: RiskLevel.CRITICAL,
          score: 100,
          warnings: 'Contract code is empty.',
          timestamp: Date.now()
        };
      }

      let warnings = '';
      let score = 0;

      // Analyze contract code (non-empty, so no extra penalty here).
      // Analyze holder distribution.
      if (holderPercent > 50) {
        warnings += 'Top holder controls majority of tokens. ';
        score += holderPercent;
      } else if (holderPercent > 30) {
        warnings += 'Top holder controls a significant portion of tokens. ';
        score += holderPercent * 0.5;
      }

      // Analyze liquidity.
      if (!liquidity.locked) {
        warnings += 'Liquidity is not locked. ';
        score += 20;
      }

      // Determine risk level based on the score.
      let risk: RiskLevel;
      if (score >= 80) {
        risk = RiskLevel.CRITICAL;
      } else if (score >= 50) {
        risk = RiskLevel.HIGH;
      } else if (score >= 30) {
        risk = RiskLevel.MEDIUM;
      } else {
        risk = RiskLevel.LOW;
      }

      return {
        risk,
        score,
        warnings: warnings.trim(),
        timestamp: Date.now()
      };
    } catch (error: unknown) {
      return this.createErrorAnalysis(error, address);
    }
  }

  /**
   * Returns a default RugAnalysis in case of errors.
   * @param error The encountered error.
   * @param address The token contract address.
   * @returns A RugAnalysis object with critical risk.
   */
  private createErrorAnalysis(error: unknown, address: string): RugAnalysis {
    let message = '';
    if (axios.isAxiosError(error)) {
      message = `Axios error: ${error.message}`;
    } else if (error instanceof Error) {
      message = error.message;
    } else {
      message = 'Unknown error';
    }
    console.error(`Error validating contract ${address}:`, message);
    return {
      risk: RiskLevel.CRITICAL,
      score: 100,
      warnings: message,
      timestamp: Date.now()
    };
  }

  /**
   * Fetches the contract code using Solscan.
   * Uses caching via Redis if available.
   * @param address The token contract address.
   * @returns A promise resolving to the contract code.
   */
  private async getContractCode(address: string): Promise<string> {
    const cacheKey = `contractCode:${address}`;
    if (this.redisClient) {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) return cached;
    }
    try {
      const url = `${this.solscanContractUrl}?address=${address}`;
      const response = await axios.get(url);
      const data = response.data;
      let code = '';
      if (data && data.program && data.program.length > 0) {
        code = data.program;
      }
      if (this.redisClient) {
        await this.redisClient.set(cacheKey, code, 'EX', 600);
      }
      return code;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error(`Axios error fetching contract code for ${address}:`, error.message);
        throw new Error(`Axios error: ${error.message}`);
      }
      console.error(`Error fetching contract code for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Fetches the holder distribution percentage using Solscan.
   * Uses caching via Redis if available.
   * @param address The token contract address.
   * @returns A promise resolving to the top holder's percentage.
   */
  private async getHolderDistribution(address: string): Promise<number> {
    const cacheKey = `holderDist:${address}`;
    if (this.redisClient) {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) return parseFloat(cached);
    }
    try {
      const url = `${this.solscanHoldersUrl}?tokenAddress=${address}&offset=0&limit=1`;
      const response = await axios.get(url);
      const data = response.data;
      let percent = 0;
      if (data && data.data && data.data.length > 0 && data.data[0].percent) {
        percent = parseFloat(data.data[0].percent);
      }
      if (this.redisClient) {
        await this.redisClient.set(cacheKey, percent.toString(), 'EX', 600);
      }
      return percent;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        console.error(`Axios error fetching holder distribution for ${address}:`, error.message);
        throw new Error(`Axios error: ${error.message}`);
      }
      console.error(`Error fetching holder distribution for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves liquidity metrics for the token.
   * Placeholder – integrate with a real liquidity API as needed.
   * @param address The token contract address.
   * @returns A promise resolving to liquidity metrics.
   */
  private async getLiquidityMetrics(address: string): Promise<LiquidityMetrics> {
    console.warn(`Liquidity metrics not implemented for ${address}. Returning default values.`);
    return { locked: false, totalLiquidity: 0 };
  }

  /**
   * A shutdown method to clean up any resources (e.g., clear intervals).
   */
  public shutdown(): void {
    // Add cleanup logic if necessary.
    console.log("ContractValidator shutdown completed.");
  }
}

export default ContractValidator;
