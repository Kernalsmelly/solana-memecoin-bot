"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenVettingService = void 0;
const web3_js_1 = require("@solana/web3.js");
const events_1 = require("events");
const logger_1 = __importDefault(require("../utils/logger"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Token Vetting Service
 * Advanced security layer to protect against scam tokens
 * and ensure only high-quality trading opportunities
 */
class TokenVettingService extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.blacklistedAddresses = new Set();
        this.blacklistedCreators = new Set();
        this.vettingResults = new Map();
        this.config = {
            blacklistPath: './data/security/blacklist.json',
            minHolders: 20,
            minTradingAge: 1, // 1 hour minimum
            maxBuySellTaxPercent: 10, // Max tax 10%
            minLiquidity: 10000, // $10k minimum
            ...config
        };
        // Load blacklists
        this.loadBlacklists();
        logger_1.default.info('Token Vetting Service initialized');
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
                    creators: []
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
            logger_1.default.info('Loaded token blacklists', {
                tokenCount: this.blacklistedAddresses.size,
                creatorCount: this.blacklistedCreators.size
            });
        }
        catch (error) {
            logger_1.default.error('Error loading blacklists', error);
        }
    }
    /**
     * Save blacklists to file
     */
    saveBlacklists() {
        try {
            const blacklistData = {
                tokens: Array.from(this.blacklistedAddresses),
                creators: Array.from(this.blacklistedCreators)
            };
            fs.writeFileSync(this.config.blacklistPath, JSON.stringify(blacklistData, null, 2));
            logger_1.default.info('Saved token blacklists', {
                tokenCount: this.blacklistedAddresses.size,
                creatorCount: this.blacklistedCreators.size
            });
        }
        catch (error) {
            logger_1.default.error('Error saving blacklists', error);
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
            logger_1.default.info('Vetting token', { tokenAddress });
            // Initialize result
            const result = {
                address: tokenAddress,
                symbol: 'UNKNOWN',
                passed: false,
                score: 0,
                warnings: [],
                criticalIssues: [],
                metadata: {}
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
            logger_1.default.info('Token vetting completed', {
                token: result.symbol,
                address: tokenAddress,
                passed: result.passed,
                score: result.score,
                warnings: result.warnings.length,
                criticalIssues: result.criticalIssues.length
            });
            // Emit event
            this.emit('vettingComplete', result);
            return result;
        }
        catch (error) {
            logger_1.default.error('Error vetting token', {
                tokenAddress,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return {
                address: tokenAddress,
                symbol: 'UNKNOWN',
                passed: false,
                score: 0,
                warnings: [],
                criticalIssues: ['Error during vetting process'],
                metadata: {}
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
            const signatures = await this.config.connection.getSignaturesForAddress(new web3_js_1.PublicKey(tokenAddress), { limit: 1 });
            if (signatures.length > 0) {
                const blockTime = signatures[0].blockTime;
                if (blockTime) {
                    return (Date.now() / 1000 - blockTime) / 3600; // Convert to hours
                }
            }
            return 24; // Default to 24 hours if can't determine
        }
        catch (error) {
            logger_1.default.warn('Error getting token age', error);
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
            logger_1.default.warn('Error getting holder count', error);
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
            logger_1.default.warn('Error estimating taxes', error);
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
            logger_1.default.info('Added token to blacklist', {
                tokenAddress,
                reason,
                totalBlacklisted: this.blacklistedAddresses.size
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
            logger_1.default.info('Added creator to blacklist', {
                creatorAddress,
                reason,
                totalBlacklisted: this.blacklistedCreators.size
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
        logger_1.default.debug('Cleared token vetting cache');
    }
}
exports.TokenVettingService = TokenVettingService;
