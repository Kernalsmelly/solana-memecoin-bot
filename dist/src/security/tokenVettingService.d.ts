import { Connection } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { ContractValidator } from '../utils/contractValidator.js';
import { BirdeyeAPI } from '../api/birdeyeAPI.js';
interface TokenVettingConfig {
    connection: Connection;
    birdeyeAPI: BirdeyeAPI;
    contractValidator: ContractValidator;
    blacklistPath?: string;
    minHolders?: number;
    minTradingAge?: number;
    maxBuySellTaxPercent?: number;
    minLiquidity?: number;
}
interface VettingResult {
    address: string;
    symbol: string;
    passed: boolean;
    score: number;
    warnings: string[];
    criticalIssues: string[];
    metadata: {
        holders?: number;
        age?: number;
        buySellTax?: number;
        creator?: string;
        liquidity?: number;
        verified?: boolean;
    };
}
/**
 * Token Vetting Service
 * Advanced security layer to protect against scam tokens
 * and ensure only high-quality trading opportunities
 */
export declare class TokenVettingService extends EventEmitter {
    private config;
    private blacklistedAddresses;
    private blacklistedCreators;
    private vettingResults;
    constructor(config: TokenVettingConfig);
    /**
     * Load blacklisted addresses and creators
     */
    private loadBlacklists;
    /**
     * Save blacklists to file
     */
    private saveBlacklists;
    /**
     * Vet a token for trading suitability
     */
    vetToken(tokenAddress: string): Promise<VettingResult>;
    /**
     * Get token age in hours (simplified implementation)
     */
    private getTokenAge;
    /**
     * Get holder count (simplified implementation)
     */
    private getHolderCount;
    /**
     * Estimate buy/sell taxes (simplified implementation)
     */
    private estimateTaxes;
    /**
     * Add token to blacklist
     */
    blacklistToken(tokenAddress: string, reason: string): void;
    /**
     * Add creator to blacklist
     */
    blacklistCreator(creatorAddress: string, reason: string): void;
    /**
     * Check if a token is blacklisted
     */
    isTokenBlacklisted(tokenAddress: string): boolean;
    /**
     * Check if a creator is blacklisted
     */
    isCreatorBlacklisted(creatorAddress: string): boolean;
    /**
     * Get all blacklisted tokens
     */
    getBlacklistedTokens(): string[];
    /**
     * Clear vetting cache
     */
    clearCache(): void;
}
export {};
//# sourceMappingURL=tokenVettingService.d.ts.map