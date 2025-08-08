import { PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
/**
 * Token Vetting Service
 * Advanced security layer to protect against scam tokens
 * and ensure only high-quality trading opportunities
 */
export class TokenVettingService extends EventEmitter {
    config;
    blacklistedAddresses = new Set();
    blacklistedCreators = new Set();
    vettingResults = new Map();
    constructor(config) {
        super();
        this.config = {
            blacklistPath: './data/security/blacklist.json',
            minHolders: 20,
            minTradingAge: 1, // 1 hour minimum
            maxBuySellTaxPercent: 10, // Max tax 10%
            minLiquidity: 10000, // $10k minimum
            ...config,
        };
        // Load blacklists
        this.loadBlacklists();
        logger.info('Token Vetting Service initialized');
    }
    /**
     * Load blacklisted addresses and creators
     */
    loadBlacklists() {
        try {
            const blacklistPath = this.config.blacklistPath;
            // Create directory if it doesn't exist
            const directory = path.dirname(blacklistPath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }
            // Create file if it doesn't exist
            if (!fs.existsSync(blacklistPath)) {
                fs.writeFileSync(blacklistPath, JSON.stringify({
                    tokens: [],
                    creators: [],
                }, null, 2));
            }
            // Load blacklist
            const blacklistData = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
            // Add to sets
            if (Array.isArray(blacklistData.tokens)) {
                blacklistData.tokens.forEach((address) => {
                    this.blacklistedAddresses.add(address);
                });
            }
            if (Array.isArray(blacklistData.creators)) {
                blacklistData.creators.forEach((creator) => {
                    this.blacklistedCreators.add(creator);
                });
            }
            logger.info('Loaded token blacklists', {
                tokenCount: this.blacklistedAddresses.size,
                creatorCount: this.blacklistedCreators.size,
            });
        }
        catch (error) {
            logger.error('Error loading blacklists', error);
        }
    }
    /**
     * Save blacklists to file
     */
    saveBlacklists() {
        try {
            const blacklistData = {
                tokens: Array.from(this.blacklistedAddresses),
                creators: Array.from(this.blacklistedCreators),
            };
            fs.writeFileSync(this.config.blacklistPath, JSON.stringify(blacklistData, null, 2));
            logger.info('Saved token blacklists', {
                tokenCount: this.blacklistedAddresses.size,
                creatorCount: this.blacklistedCreators.size,
            });
        }
        catch (error) {
            logger.error('Error saving blacklists', error);
        }
    }
    /**
     * Vet a token for trading suitability
     */
    async vetToken(tokenAddress) {
        try {
            // Check cache first
            if (this.vettingResults.has(tokenAddress)) {
                return this.vettingResults.get(tokenAddress);
            }
            logger.info('Vetting token', { tokenAddress });
            // Initialize result
            const result = {
                address: tokenAddress,
                symbol: 'UNKNOWN',
                passed: false,
                score: 0,
                warnings: [],
                criticalIssues: [],
                metadata: {},
            };
            // Check if blacklisted
            if (this.blacklistedAddresses.has(tokenAddress)) {
                result.criticalIssues.push('Token is blacklisted');
                result.passed = false;
                result.score = 0;
                this.vettingResults.set(tokenAddress, result);
                return result;
            }
            // Get token metadata
            const metadata = await this.config.birdeyeAPI.getTokenMetadata(tokenAddress);
            if (!metadata) {
                result.criticalIssues.push('Unable to fetch token metadata');
                result.passed = false;
                result.score = 0;
                this.vettingResults.set(tokenAddress, result);
                return result;
            }
            result.symbol = metadata.symbol || 'UNKNOWN';
            result.metadata.liquidity = metadata.liquidity;
            // Validate token contract
            const contractValidation = await this.config.contractValidator.validateContract(tokenAddress);
            // Check contract validation
            if (!contractValidation.isValid) {
                result.criticalIssues.push('Contract validation failed');
                for (const risk of contractValidation.risks) {
                    if (risk.level === 'CRITICAL' || risk.level === 'HIGH') {
                        result.criticalIssues.push(risk.description);
                    }
                    else {
                        result.warnings.push(risk.description);
                    }
                }
                result.score = contractValidation.score;
                result.passed = false;
                this.vettingResults.set(tokenAddress, result);
                return result;
            }
            // Check creator address
            if (contractValidation.tokenMetadata && contractValidation.tokenMetadata.updateAuthority) {
                const creator = contractValidation.tokenMetadata.updateAuthority;
                result.metadata.creator = creator;
                // Check if creator is blacklisted
                if (this.blacklistedCreators.has(creator)) {
                    result.criticalIssues.push(`Token creator (${creator}) is blacklisted`);
                    result.passed = false;
                    result.score = 0;
                    this.vettingResults.set(tokenAddress, result);
                    return result;
                }
            }
            // Perform additional security checks
            // 1. Liquidity check (check if liquidity exists)
            const currentLiquidity = metadata.liquidity ?? 0;
            if (currentLiquidity < this.config.minLiquidity) {
                result.warnings.push(`Low liquidity: $${metadata.liquidity} (minimum: $${this.config.minLiquidity})`);
                result.score -= 10;
            }
            // 2. Token age check (simplified implementation)
            const age = await this.getTokenAge(tokenAddress);
            result.metadata.age = age;
            if (age < this.config.minTradingAge) {
                result.warnings.push(`Token too new: ${age.toFixed(1)} hours old (minimum: ${this.config.minTradingAge} hours)`);
                result.score -= 10;
            }
            // 3. Holder count check (simplified implementation)
            const holders = await this.getHolderCount(tokenAddress);
            result.metadata.holders = holders;
            if (holders < this.config.minHolders) {
                result.warnings.push(`Few holders: ${holders} (minimum: ${this.config.minHolders})`);
                result.score -= 10;
            }
            // 4. Buy/sell tax check (simplified implementation)
            const taxPercent = await this.estimateTaxes(tokenAddress);
            result.metadata.buySellTax = taxPercent;
            if (taxPercent > this.config.maxBuySellTaxPercent) {
                result.criticalIssues.push(`High taxes: ${taxPercent}% (maximum: ${this.config.maxBuySellTaxPercent}%)`);
                result.score -= 30;
            }
            // Calculate final score based on contract score and adjustments
            result.score = Math.max(0, contractValidation.score - result.warnings.length * 5 - result.criticalIssues.length * 20);
            // Determine if token passed vetting
            result.passed = result.score >= 70 && result.criticalIssues.length === 0;
            // Cache result
            this.vettingResults.set(tokenAddress, result);
            // Log result
            logger.info('Token vetting completed', {
                token: result.symbol,
                address: tokenAddress,
                passed: result.passed,
                score: result.score,
                warnings: result.warnings.length,
                criticalIssues: result.criticalIssues.length,
            });
            // Emit event
            this.emit('vettingComplete', result);
            return result;
        }
        catch (error) {
            logger.error('Error vetting token', {
                tokenAddress,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return {
                address: tokenAddress,
                symbol: 'UNKNOWN',
                passed: false,
                score: 0,
                warnings: [],
                criticalIssues: ['Error during vetting process'],
                metadata: {},
            };
        }
    }
    /**
     * Get token age in hours (simplified implementation)
     */
    async getTokenAge(tokenAddress) {
        try {
            // In a real implementation, you would query for token creation time
            // This is a simplified placeholder
            const signatures = await this.config.connection.getSignaturesForAddress(new PublicKey(tokenAddress), { limit: 1 });
            if (signatures.length > 0) {
                // Ensure the first signature exists and has a blockTime
                const firstSignature = signatures[0];
                if (firstSignature && firstSignature.blockTime) {
                    const blockTime = firstSignature.blockTime;
                    return (Date.now() / 1000 - blockTime) / 3600; // Convert to hours
                }
            }
            return 24; // Default to 24 hours if can't determine
        }
        catch (error) {
            logger.warn('Error getting token age', error);
            return 24; // Default to 24 hours if can't determine
        }
    }
    /**
     * Get holder count (simplified implementation)
     */
    async getHolderCount(tokenAddress) {
        try {
            // In a real implementation, you would query an indexer
            // This is a simplified placeholder
            return 50; // Default placeholder value
        }
        catch (error) {
            logger.warn('Error getting holder count', error);
            return 50; // Default placeholder value
        }
    }
    /**
     * Estimate buy/sell taxes (simplified implementation)
     */
    async estimateTaxes(tokenAddress) {
        try {
            // In a real implementation, you would perform test swaps
            // This is a simplified placeholder
            return 0; // Default to 0% tax
        }
        catch (error) {
            logger.warn('Error estimating taxes', error);
            return 0; // Default to 0% tax
        }
    }
    /**
     * Add token to blacklist
     */
    blacklistToken(tokenAddress, reason) {
        if (!this.blacklistedAddresses.has(tokenAddress)) {
            this.blacklistedAddresses.add(tokenAddress);
            this.saveBlacklists();
            logger.info('Added token to blacklist', {
                tokenAddress,
                reason,
                totalBlacklisted: this.blacklistedAddresses.size,
            });
            // Invalidate cache
            this.vettingResults.delete(tokenAddress);
        }
    }
    /**
     * Add creator to blacklist
     */
    blacklistCreator(creatorAddress, reason) {
        if (!this.blacklistedCreators.has(creatorAddress)) {
            this.blacklistedCreators.add(creatorAddress);
            this.saveBlacklists();
            logger.info('Added creator to blacklist', {
                creatorAddress,
                reason,
                totalBlacklisted: this.blacklistedCreators.size,
            });
            // Also blacklist the token if provided
            if (this.config.contractValidator) {
                this.config.contractValidator.blacklistCreator(creatorAddress);
            }
        }
    }
    /**
     * Check if a token is blacklisted
     */
    isTokenBlacklisted(tokenAddress) {
        return this.blacklistedAddresses.has(tokenAddress);
    }
    /**
     * Check if a creator is blacklisted
     */
    isCreatorBlacklisted(creatorAddress) {
        return this.blacklistedCreators.has(creatorAddress);
    }
    /**
     * Get all blacklisted tokens
     */
    getBlacklistedTokens() {
        return Array.from(this.blacklistedAddresses);
    }
    /**
     * Clear vetting cache
     */
    clearCache() {
        this.vettingResults.clear();
        logger.debug('Cleared token vetting cache');
    }
}
//# sourceMappingURL=tokenVettingService.js.map