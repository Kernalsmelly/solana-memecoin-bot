import { Connection } from '@solana/web3.js';
import { RiskManager } from '../live/riskManager';
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
    minDeploymentAge: number;
    minLiquidity: number;
    minHolders: number;
    blockedCreators: string[];
    suspiciousPatterns: string[];
    riskManager?: RiskManager;
}
/**
 * Smart Contract Validator
 * Analyzes token smart contracts for security risks and red flags
 */
export declare class ContractValidator {
    private connection;
    private config;
    private riskManager;
    private validationCache;
    constructor(connection: Connection, config?: Partial<ContractValidatorConfig>);
    /**
     * Validate a token contract for security risks
     */
    validateContract(tokenAddress: string): Promise<ContractValidationResult>;
    /**
     * Get token metadata (simplified implementation)
     */
    private getTokenMetadata;
    /**
     * Get token creation slot
     */
    private getTokenCreationSlot;
    /**
     * Convert slot to approximate age in hours
     */
    private getSlotAge;
    /**
     * Get mint info (simplified implementation)
     */
    private getMintInfo;
    /**
     * Get token liquidity (simplified implementation)
     */
    private getTokenLiquidity;
    /**
     * Get unique holder count (simplified implementation)
     */
    private getHolderCount;
    /**
     * Blacklist a creator address
     */
    blacklistCreator(creatorAddress: string): void;
    /**
     * Update validator configuration
     */
    updateConfig(config: Partial<ContractValidatorConfig>): void;
    /**
     * Clear validation cache
     */
    clearCache(): void;
}
export default ContractValidator;
//# sourceMappingURL=contractValidator.d.ts.map