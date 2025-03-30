import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from "@project-serum/anchor";
import logger from './logger';
import { sendAlert } from './notifications';
import { RiskManager, CircuitBreakerReason } from '../live/riskManager';

interface ContractValidationResult {
  isValid: boolean;
  score: number;
  risks: ContractRisk[];
  tokenMetadata?: any;
}

interface ContractRisk {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  type: string;
  description: string;
}

interface ContractValidatorConfig {
  minDeploymentAge: number; // in hours
  minLiquidity: number; // in USD
  minHolders: number;
  blockedCreators: string[];
  suspiciousPatterns: string[];
  riskManager?: RiskManager;
}

/**
 * Smart Contract Validator
 * Analyzes token smart contracts for security risks and red flags
 */
export class ContractValidator {
  private connection: Connection;
  private config: ContractValidatorConfig;
  private riskManager: RiskManager | null;
  
  // Cache of previously validated contracts
  private validationCache: Map<string, { result: ContractValidationResult, timestamp: number }> = new Map();
  
  constructor(connection: Connection, config?: Partial<ContractValidatorConfig>) {
    this.connection = connection;
    this.riskManager = config?.riskManager || null;
    
    // Default configuration
    this.config = {
      minDeploymentAge: 1, // 1 hour minimum age
      minLiquidity: 5000, // $5,000 minimum liquidity
      minHolders: 10, // at least 10 different holders
      blockedCreators: [], // blacklisted creator addresses
      suspiciousPatterns: [
        'freezeAuthority', 
        'mintAuthority',
        'transferHook',
        'closeAccount'
      ]
    };
    
    // Apply custom config if provided
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }
  
  /**
   * Validate a token contract for security risks
   */
  public async validateContract(tokenAddress: string): Promise<ContractValidationResult> {
    try {
      // Check cache first
      const cachedResult = this.validationCache.get(tokenAddress);
      if (cachedResult && (Date.now() - cachedResult.timestamp) < 3600000) { // Cache valid for 1 hour
        return cachedResult.result;
      }
      
      logger.info('Validating token contract', { tokenAddress });
      
      const mint = new PublicKey(tokenAddress);
      
      // Initialize result
      const result: ContractValidationResult = {
        isValid: true,
        score: 100, // Start with perfect score
        risks: []
      };
      
      // Fetch token metadata
      const tokenMetadata = await this.getTokenMetadata(mint);
      result.tokenMetadata = tokenMetadata;
      
      // Validate token creation date
      const accountInfo = await this.connection.getAccountInfo(mint);
      if (!accountInfo) {
        throw new Error(`Token account not found: ${tokenAddress}`);
      }
      
      // Check deployment age
      const slot = await this.getTokenCreationSlot(mint);
      const deploymentAge = await this.getSlotAge(slot);
      
      if (deploymentAge < this.config.minDeploymentAge) {
        result.risks.push({
          level: 'HIGH',
          type: 'NEW_CONTRACT',
          description: `Token deployed only ${deploymentAge.toFixed(1)} hours ago (minimum: ${this.config.minDeploymentAge} hours)`
        });
        result.score -= 30;
        result.isValid = false;
      }
      
      // Check program ownership
      if (accountInfo.owner.toString() !== anchor.utils.token.TOKEN_PROGRAM_ID.toString()) {
        result.risks.push({
          level: 'HIGH',
          type: 'CUSTOM_PROGRAM',
          description: `Token not owned by standard Token Program: ${accountInfo.owner.toString()}`
        });
        result.score -= 40;
        result.isValid = false;
      }
      
      // Check for suspicious mint authorities
      const mintInfo = await this.getMintInfo(mint);
      if (mintInfo && mintInfo.mintAuthority) {
        result.risks.push({
          level: 'HIGH',
          type: 'MINT_AUTHORITY',
          description: 'Token has an active mint authority, enabling unlimited minting'
        });
        result.score -= 30;
        result.isValid = false;
      }
      
      // Check for freeze authority
      if (mintInfo && mintInfo.freezeAuthority) {
        result.risks.push({
          level: 'MEDIUM',
          type: 'FREEZE_AUTHORITY',
          description: 'Token has freeze authority, allowing creator to block transfers'
        });
        result.score -= 20;
      }
      
      // Check liquidity
      const liquidity = await this.getTokenLiquidity(mint);
      if (liquidity < this.config.minLiquidity) {
        result.risks.push({
          level: 'MEDIUM',
          type: 'LOW_LIQUIDITY',
          description: `Token has low liquidity: $${liquidity.toFixed(2)} (minimum: $${this.config.minLiquidity})`
        });
        result.score -= 15;
      }
      
      // Check holder count
      const holderCount = await this.getHolderCount(mint);
      if (holderCount < this.config.minHolders) {
        result.risks.push({
          level: 'MEDIUM',
          type: 'FEW_HOLDERS',
          description: `Token has few unique holders: ${holderCount} (minimum: ${this.config.minHolders})`
        });
        result.score -= 10;
      }
      
      // Check for blacklisted creators
      if (tokenMetadata && tokenMetadata.updateAuthority) {
        const creator = tokenMetadata.updateAuthority;
        if (this.config.blockedCreators.includes(creator)) {
          result.risks.push({
            level: 'CRITICAL',
            type: 'BLACKLISTED_CREATOR',
            description: `Token creator ${creator} is blacklisted`
          });
          result.score -= 100;
          result.isValid = false;
        }
      }
      
      // If we have critical or multiple high risks, the contract is not valid
      const criticalRisks = result.risks.filter(r => r.level === 'CRITICAL').length;
      const highRisks = result.risks.filter(r => r.level === 'HIGH').length;
      
      if (criticalRisks > 0 || highRisks >= 2 || result.score < 50) {
        result.isValid = false;
      }
      
      // Update risk manager if provided
      if (!result.isValid && this.riskManager) {
        const reason = criticalRisks > 0 ? 'CRITICAL_CONTRACT_RISK' : 'HIGH_CONTRACT_RISK';
        const message = `Contract validation failed for ${tokenAddress}: ${result.risks.map(r => r.type).join(', ')}`;
        this.riskManager.triggerCircuitBreaker(CircuitBreakerReason.CONTRACT_RISK, message);
        
        // Send alert
        await sendAlert(
          `⚠️ Contract Risk Detected: ${tokenAddress}\n${message}`,
          'WARNING'
        );
      }
      
      // Cache the result
      this.validationCache.set(tokenAddress, {
        result,
        timestamp: Date.now()
      });
      
      logger.info('Contract validation completed', {
        tokenAddress,
        isValid: result.isValid,
        score: result.score,
        riskCount: result.risks.length
      });
      
      return result;
    } catch (error) {
      logger.error('Error validating contract', {
        tokenAddress,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        isValid: false,
        score: 0,
        risks: [{
          level: 'CRITICAL',
          type: 'VALIDATION_ERROR',
          description: error instanceof Error ? error.message : 'Unknown error during validation'
        }]
      };
    }
  }
  
  /**
   * Get token metadata (simplified implementation)
   */
  private async getTokenMetadata(mint: PublicKey): Promise<any> {
    try {
      // In a real implementation, you would call the Metaplex API
      // This is a simplified placeholder
      return { updateAuthority: null };
    } catch (error) {
      logger.warn('Error fetching token metadata', {
        mint: mint.toString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }
  
  /**
   * Get token creation slot
   */
  private async getTokenCreationSlot(mint: PublicKey): Promise<number> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(mint, { limit: 1 }, 'confirmed');
      if (signatures.length === 0) {
        return 0;
      }
      
      return signatures[0].slot;
    } catch (error) {
      logger.warn('Error getting token creation slot', {
        mint: mint.toString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }
  
  /**
   * Convert slot to approximate age in hours
   */
  private async getSlotAge(slot: number): Promise<number> {
    try {
      if (slot === 0) return 0;
      
      const currentSlot = await this.connection.getSlot('finalized');
      const slotDiff = currentSlot - slot;
      
      // Approximate slot time (Solana aims for 400ms per slot)
      const ageInSeconds = slotDiff * 0.4;
      const ageInHours = ageInSeconds / 3600;
      
      return ageInHours;
    } catch (error) {
      logger.warn('Error calculating slot age', {
        slot,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }
  
  /**
   * Get mint info (simplified implementation)
   */
  private async getMintInfo(mint: PublicKey): Promise<any> {
    try {
      // In a real implementation, you would use the spl-token library
      // This is a simplified placeholder
      return {
        mintAuthority: null,
        freezeAuthority: null
      };
    } catch (error) {
      logger.warn('Error fetching mint info', {
        mint: mint.toString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }
  
  /**
   * Get token liquidity (simplified implementation)
   */
  private async getTokenLiquidity(mint: PublicKey): Promise<number> {
    try {
      // In a real implementation, you would fetch this from Jupiter or Birdeye API
      // This is a placeholder that returns a random value for demonstration
      return Math.random() * 1000000 + 5000;
    } catch (error) {
      logger.warn('Error fetching token liquidity', {
        mint: mint.toString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }
  
  /**
   * Get unique holder count (simplified implementation)
   */
  private async getHolderCount(mint: PublicKey): Promise<number> {
    try {
      // In a real implementation, you would fetch this from an indexer
      // This is a placeholder that returns a random value for demonstration
      return Math.floor(Math.random() * 1000 + 20);
    } catch (error) {
      logger.warn('Error fetching holder count', {
        mint: mint.toString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }
  
  /**
   * Blacklist a creator address
   */
  public blacklistCreator(creatorAddress: string): void {
    if (!this.config.blockedCreators.includes(creatorAddress)) {
      this.config.blockedCreators.push(creatorAddress);
      logger.info('Creator added to blacklist', { creatorAddress });
    }
  }
  
  /**
   * Update validator configuration
   */
  public updateConfig(config: Partial<ContractValidatorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Contract validator configuration updated', this.config);
  }
  
  /**
   * Clear validation cache
   */
  public clearCache(): void {
    this.validationCache.clear();
    logger.debug('Contract validation cache cleared');
  }
}

export default ContractValidator;
