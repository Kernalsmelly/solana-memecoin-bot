"use strict";
// src/contractValidator.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskLevel = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Enumeration of risk levels.
 */
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["LOW"] = "LOW";
    RiskLevel["MEDIUM"] = "MEDIUM";
    RiskLevel["HIGH"] = "HIGH";
    RiskLevel["CRITICAL"] = "CRITICAL";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
/**
 * ContractValidator fetches data about a token contract and produces a risk analysis.
 */
class ContractValidator {
    constructor(options) {
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
    async validateContract(address) {
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
            }
            else if (holderPercent > 30) {
                warnings += 'Top holder controls a significant portion of tokens. ';
                score += holderPercent * 0.5;
            }
            // Analyze liquidity.
            if (!liquidity.locked) {
                warnings += 'Liquidity is not locked. ';
                score += 20;
            }
            // Determine risk level based on the score.
            let risk;
            if (score >= 80) {
                risk = RiskLevel.CRITICAL;
            }
            else if (score >= 50) {
                risk = RiskLevel.HIGH;
            }
            else if (score >= 30) {
                risk = RiskLevel.MEDIUM;
            }
            else {
                risk = RiskLevel.LOW;
            }
            return {
                risk,
                score,
                warnings: warnings.trim(),
                timestamp: Date.now()
            };
        }
        catch (error) {
            return this.createErrorAnalysis(error, address);
        }
    }
    /**
     * Returns a default RugAnalysis in case of errors.
     * @param error The encountered error.
     * @param address The token contract address.
     * @returns A RugAnalysis object with critical risk.
     */
    createErrorAnalysis(error, address) {
        let message = '';
        if (axios_1.default.isAxiosError(error)) {
            message = `Axios error: ${error.message}`;
        }
        else if (error instanceof Error) {
            message = error.message;
        }
        else {
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
    async getContractCode(address) {
        const cacheKey = `contractCode:${address}`;
        if (this.redisClient) {
            const cached = await this.redisClient.get(cacheKey);
            if (cached)
                return cached;
        }
        try {
            const url = `${this.solscanContractUrl}?address=${address}`;
            const response = await axios_1.default.get(url);
            const data = response.data;
            let code = '';
            if (data && data.program && data.program.length > 0) {
                code = data.program;
            }
            if (this.redisClient) {
                await this.redisClient.set(cacheKey, code, 'EX', 600);
            }
            return code;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
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
    async getHolderDistribution(address) {
        const cacheKey = `holderDist:${address}`;
        if (this.redisClient) {
            const cached = await this.redisClient.get(cacheKey);
            if (cached)
                return parseFloat(cached);
        }
        try {
            const url = `${this.solscanHoldersUrl}?tokenAddress=${address}&offset=0&limit=1`;
            const response = await axios_1.default.get(url);
            const data = response.data;
            let percent = 0;
            if (data && data.data && data.data.length > 0 && data.data[0].percent) {
                percent = parseFloat(data.data[0].percent);
            }
            if (this.redisClient) {
                await this.redisClient.set(cacheKey, percent.toString(), 'EX', 600);
            }
            return percent;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
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
    async getLiquidityMetrics(address) {
        console.warn(`Liquidity metrics not implemented for ${address}. Returning default values.`);
        return { locked: false, totalLiquidity: 0 };
    }
    /**
     * A shutdown method to clean up any resources (e.g., clear intervals).
     */
    shutdown() {
        // Add cleanup logic if necessary.
        console.log("ContractValidator shutdown completed.");
    }
}
exports.default = ContractValidator;
