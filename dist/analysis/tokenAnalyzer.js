"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenAnalyzer = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const cache_1 = require("../utils/cache");
class TokenAnalyzer {
    scamPatterns;
    nameBlacklist;
    addressBlacklist;
    minLiquidity;
    minHolders;
    tokenScoreCache;
    cacheManager = cache_1.globalCacheManager;
    constructor({ minLiquidity = 1000, // Minimum liquidity in USD
    minHolders = 10, // Minimum holder count
    cacheTimeMs = 3600000 // Cache scores for 1 hour
     } = {}) {
        this.minLiquidity = minLiquidity;
        this.minHolders = minHolders;
        // Initialize cache using our optimized cache manager
        this.tokenScoreCache = new Map();
        this.cacheManager.getCache('tokenScores', {
            maxSize: 5000,
            ttl: cacheTimeMs,
            onEvict: (key, value) => {
                logger_1.default.debug(`Evicted token score from cache: ${key}`);
            }
        });
        // Initialize scam detection patterns
        this.scamPatterns = [
            /\b(fake|scam|pump|dump|airdrop|free)\b/i,
            /\b(elon|musk|bezos|gates|trump|biden)\b/i,
            /\b(eth2.0|eth2|btc2.0|btc2)\b/i
        ];
        this.nameBlacklist = new Set([
            'test', 'sample', 'token', 'coin', 'airdrop', 'free'
        ]);
        this.addressBlacklist = new Set();
    }
    // Analyze a token and return a score (0-100)
    analyzeToken(token) {
        // Check cache first
        const cachedScore = this.getCachedScore(token.address);
        if (cachedScore !== undefined) {
            return {
                ...token,
                score: cachedScore,
                analysisTime: Date.now()
            };
        }
        // Check for scam patterns
        if (this.isLikelyScam(token)) {
            const scamToken = {
                ...token,
                isScam: true,
                score: 0,
                analysisTime: Date.now(),
                riskLevel: 'high'
            };
            this.cacheScore(token.address, 0);
            return scamToken;
        }
        // Calculate individual scores
        const liquidityScore = this.calculateLiquidityScore(token);
        const nameScore = this.calculateNameScore(token);
        const holderScore = this.calculateHolderScore(token);
        const ageScore = this.calculateAgeScore(token);
        // Calculate overall score (weighted average)
        const overallScore = Math.round((liquidityScore * 0.4) +
            (nameScore * 0.2) +
            (holderScore * 0.3) +
            (ageScore * 0.1));
        // Determine risk level
        let riskLevel = 'medium';
        if (overallScore >= 70)
            riskLevel = 'low';
        else if (overallScore <= 30)
            riskLevel = 'high';
        // Create analyzed token
        const analyzedToken = {
            ...token,
            score: overallScore,
            analysisTime: Date.now(),
            riskLevel,
            analysisDetails: {
                liquidityScore,
                nameScore,
                holderScore,
                ageScore
            }
        };
        // Cache the score
        this.cacheScore(token.address, overallScore);
        return analyzedToken;
    }
    // Check if token is likely a scam
    isLikelyScam(token) {
        // Check against blacklisted addresses
        if (this.addressBlacklist.has(token.address)) {
            return true;
        }
        // Check name and symbol against scam patterns
        const nameSymbol = `${token.name} ${token.symbol}`.toLowerCase();
        if (this.scamPatterns.some(pattern => pattern.test(nameSymbol))) {
            return true;
        }
        // Check if name is in blacklist
        if (this.nameBlacklist.has(token.name.toLowerCase())) {
            return true;
        }
        // Check for insufficient liquidity
        if (token.liquidity !== undefined && token.liquidity < 100) {
            return true;
        }
        return false;
    }
    // Calculate liquidity score (0-100)
    calculateLiquidityScore(token) {
        if (!token.liquidity)
            return 0;
        if (token.liquidity >= this.minLiquidity * 10) {
            return 100;
        }
        return Math.min(100, Math.round((token.liquidity / this.minLiquidity) * 50));
    }
    // Calculate name score based on various factors
    calculateNameScore(token) {
        let score = 50; // Start with neutral score
        // Check symbol length (not too short, not too long)
        if (token.symbol && token.symbol.length >= 3 && token.symbol.length <= 8) {
            score += 10;
        }
        // Check for all caps symbol (common for legitimate tokens)
        if (token.symbol === token.symbol.toUpperCase()) {
            score += 10;
        }
        // Check for excessively long names
        if (token.name && token.name.length > 30) {
            score -= 20;
        }
        // Penalize tokens with numbers in the symbol
        if (/\d/.test(token.symbol)) {
            score -= 10;
        }
        return Math.max(0, Math.min(100, score));
    }
    // Calculate score based on holder count
    calculateHolderScore(token) {
        if (!token.holders)
            return 0;
        if (token.holders >= this.minHolders * 100) {
            return 100;
        }
        return Math.min(100, Math.round((token.holders / this.minHolders) * 10));
    }
    // Calculate score based on token age
    calculateAgeScore(token) {
        if (!token.createdAt)
            return 50; // Neutral if unknown
        const ageInHours = (Date.now() - token.createdAt) / (1000 * 60 * 60);
        if (ageInHours < 1) {
            return 20; // Very new tokens are higher risk
        }
        else if (ageInHours < 24) {
            return 40; // Less than a day
        }
        else if (ageInHours < 72) {
            return 60; // 1-3 days
        }
        else if (ageInHours < 168) {
            return 80; // 3-7 days
        }
        else {
            return 100; // More than a week
        }
    }
    // Add address to blacklist
    addAddressToBlacklist(address) {
        this.addressBlacklist.add(address);
    }
    // Get cached score
    getCachedScore(address) {
        const cachedScore = this.cacheManager.getCache('tokenScores').get(address);
        if (cachedScore) {
            return cachedScore.score;
        }
        return undefined;
    }
    // Cache a token score
    cacheScore(address, score) {
        this.cacheManager.getCache('tokenScores').set(address, {
            score,
            timestamp: Date.now()
        });
    }
    // Clear score cache
    clearScoreCache() {
        this.cacheManager.getCache('tokenScores').clear();
    }
}
exports.TokenAnalyzer = TokenAnalyzer;
//# sourceMappingURL=tokenAnalyzer.js.map