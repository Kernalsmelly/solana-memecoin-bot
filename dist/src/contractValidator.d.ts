import { RugAnalysis } from './types.js';
import { Connection } from '@solana/web3.js';
/**
 * Risk level enum for token contracts
 * Represents the risk level of a token contract based on various factors
 */
export declare enum RiskLevel {
    LOW = 0,// Verified contracts, major tokens
    MEDIUM = 1,// New but legitimate tokens
    HIGH = 2,// Unverified or suspicious tokens
    CRITICAL = 3
}
/**
 * Contract validator class for analyzing token contracts
 * Class that validates token contracts and assigns risk levels
 */
export declare class ContractValidator {
    private connection;
    constructor(connection: Connection);
    /**
     * Validates a token contract and returns its risk level
     * @param tokenAddress The address of the token contract to validate
     * @returns Promise<RugAnalysis> The risk level of the token
     */
    validateContract(tokenAddress: string): Promise<RugAnalysis>;
    /**
     * Checks if a risk level is acceptable for trading
     * @param level The risk level to check
     * @returns boolean True if the risk level is acceptable
     */
    static isAcceptableRisk(level: 'low' | 'medium' | 'high'): boolean;
    /**
     * Converts a risk level to its string representation
     * @param level The risk level to convert
     * @returns string The string representation of the risk level
     */
    static getRiskLevelString(level: 'low' | 'medium' | 'high'): string;
    checkLiquidity(tokenAddress: string): Promise<number>;
    checkHolders(tokenAddress: string): Promise<number>;
}
export declare const createContractValidator: (connection: Connection) => ContractValidator;
//# sourceMappingURL=contractValidator.d.ts.map