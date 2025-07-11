"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("../utils/config"); // Correct: Import the pre-loaded config object and the type
const logger_1 = __importDefault(require("../utils/logger"));
// import { fetchLiquidityAndPrice, calculateLiquidityUsd } from '../utils/liquidity'; // Commented out - Path/Function unknown
const contractValidator_1 = require("../utils/contractValidator"); // Correct: Named import of class
// import { getTokenMetadata } from '../utils/metadata'; // Commented out - Path/Function unknown
const raydium_sdk_1 = require("@raydium-io/raydium-sdk"); // Import Raydium SDK layout
// --- Configuration ---
const TARGET_POOL_ADDRESS = '6UmmUiYoFn4GnipxcEo3n54V3DTcvNYC7msXctc6Ki5G'; // RAY/SOL Pool (Known good pool)
// Known quote mints (adjust if necessary)
const KNOWN_QUOTE_MINTS = new Set([
    "So11111111111111111111111111111111111111112", // SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC (Mainnet)
]);
async function runEvaluation() {
    logger_1.default.info(`--- Starting Manual Evaluation for Pool: ${TARGET_POOL_ADDRESS} ---`);
    try {
        // 1. Load Config
        logger_1.default.info('Configuration loaded successfully.');
        // logger.debug(`Config Details: ${JSON.stringify(config, null, 2)}`); // Uncomment for detailed config view
        // 2. Establish Connection
        const connection = new web3_js_1.Connection(config_1.config.solana.rpcEndpoint, 'confirmed');
        logger_1.default.info(`Connected to Solana RPC: ${config_1.config.solana.rpcEndpoint}`);
        const poolPublicKey = new web3_js_1.PublicKey(TARGET_POOL_ADDRESS);
        // 3. Fetch Pool Details using Raydium SDK
        const poolDetails = await fetchPoolDetailsFromRaydium(connection, TARGET_POOL_ADDRESS);
        if (!poolDetails) {
            logger_1.default.error("Failed to fetch liquidity/pool details.");
            return;
        }
        logger_1.default.info(`Raw Pool Details: BaseMint=${poolDetails.baseMint}, QuoteMint=${poolDetails.quoteMint}, BaseReserves=${poolDetails.baseReserve}, QuoteReserves=${poolDetails.quoteReserve}`);
        // Identify Base and Quote Mints
        let baseTokenMint = null;
        let quoteTokenMint = null;
        let baseTokenReserve = null;
        let quoteTokenReserve = null;
        if (KNOWN_QUOTE_MINTS.has(poolDetails.baseMint) && !KNOWN_QUOTE_MINTS.has(poolDetails.quoteMint)) {
            // Base in Raydium state is actually the Quote token (SOL/USDC)
            quoteTokenMint = poolDetails.baseMint;
            quoteTokenReserve = poolDetails.baseReserve;
            baseTokenMint = poolDetails.quoteMint;
            baseTokenReserve = poolDetails.quoteReserve;
        }
        else if (!KNOWN_QUOTE_MINTS.has(poolDetails.baseMint) && KNOWN_QUOTE_MINTS.has(poolDetails.quoteMint)) {
            // Quote in Raydium state is the Quote token (SOL/USDC)
            quoteTokenMint = poolDetails.quoteMint;
            quoteTokenReserve = poolDetails.quoteReserve;
            baseTokenMint = poolDetails.baseMint;
            baseTokenReserve = poolDetails.baseReserve;
        }
        else {
            // Handle cases where both or neither are known quote tokens (less common for target pools)
            logger_1.default.error(`Could not definitively identify base/quote token pair for pool ${TARGET_POOL_ADDRESS}. Mints: ${poolDetails.baseMint}, ${poolDetails.quoteMint}`);
            return; // Cannot proceed without clear pair identification
        }
        logger_1.default.info(`Identified Pair: Base=${baseTokenMint}, Quote=${quoteTokenMint}`);
        if (!baseTokenMint || !quoteTokenMint || baseTokenReserve === null || quoteTokenReserve === null) {
            logger_1.default.error("Failed to extract all necessary pair details.");
            return;
        }
        const baseTokenPublicKey = new web3_js_1.PublicKey(baseTokenMint);
        // 4. Calculate Liquidity in USD
        logger_1.default.warn('[SKIPPED] Liquidity calculation (calculateLiquidityUsd function/path unknown).');
        const liquidityUsd = null; // Placeholder
        const meetsLiquidityCriteria = false; // Assume false for now
        // 5. Validate Token Security
        logger_1.default.info(`Initiating contract validation for mint: ${baseTokenMint}...`);
        // Instantiate the validator
        const validator = new contractValidator_1.ContractValidator(connection); // Pass config if needed: new ContractValidator(connection, config.validatorSettings)
        // Call the validation method
        const validationResult = await validator.validateContract(baseTokenMint);
        logger_1.default.info(`Contract Validation Results for ${baseTokenMint}:`);
        logger_1.default.info(`  Is Valid: ${validationResult.isValid}`);
        logger_1.default.info(`  Score: ${validationResult.score}`);
        if (validationResult.risks.length > 0) {
            logger_1.default.warn(`  Risks Found:`);
            validationResult.risks.forEach(risk => {
                logger_1.default.warn(`    - [${risk.level}] ${risk.type}: ${risk.description}`);
            });
        }
        else {
            logger_1.default.info(`  No significant risks found.`);
        }
        if (!validationResult.isValid) {
            logger_1.default.warn(`Token security validation FAILED.`);
        }
        else {
            logger_1.default.info(`Token security validation PASSED.`);
        }
        // 6. Fetch Metadata (Optional but good)
        logger_1.default.warn('[SKIPPED] Metadata fetching (getTokenMetadata function/path unknown).');
        const metadata = null; // Placeholder
        // 7. Final Decision Logic (Simulated)
        logger_1.default.info(`--- Simulating Final Decision ---`);
        // const meetsLiquidityCriteria = liquidityUsd !== null && liquidityUsd >= config.trading.minLiquidityUsd; // Re-enable when liquidity calc is fixed
        const passesSecurityChecks = validationResult.isValid; // Use result from validator
        // if (meetsLiquidityCriteria && passesSecurityChecks) { // Re-enable when liquidity calc is fixed
        if (passesSecurityChecks) { // Temporary check based only on security
            logger_1.default.info(`CONCLUSION: Token ${baseTokenMint} in Pool ${TARGET_POOL_ADDRESS} PASSES evaluation criteria.`);
            logger_1.default.info(`  Bot action would be: CONSIDER TRADE (pending risk checks)`);
        }
        else {
            logger_1.default.warn(`CONCLUSION: Token ${baseTokenMint} in Pool ${TARGET_POOL_ADDRESS} FAILS evaluation criteria.`);
            if (!meetsLiquidityCriteria)
                logger_1.default.warn(`  Reason: Insufficient liquidity.`);
            if (!passesSecurityChecks)
                logger_1.default.warn(`  Reason: Failed security checks.`);
            logger_1.default.warn(`  Bot action would be: DO NOT TRADE`);
        }
    }
    catch (error) {
        logger_1.default.error('Error during manual evaluation:', error);
    }
    logger_1.default.info(`--- Manual Evaluation Complete ---`);
}
async function fetchPoolDetailsFromRaydium(connection, poolAddress) {
    try {
        const poolPublicKey = new web3_js_1.PublicKey(poolAddress);
        const accountInfo = await connection.getAccountInfo(poolPublicKey);
        if (!accountInfo) {
            logger_1.default.error(`Pool account not found for address: ${poolAddress}`);
            return null;
        }
        // Decode the account data using Raydium V4 layout
        const poolState = raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.decode(accountInfo.data); // Use any temporarily for debugging keys
        // Log the actual keys to help debug property access if lint errors persist
        console.log('Decoded poolState keys:', Object.keys(poolState));
        // Extract mint addresses and reserves
        // Note: Raydium SDK reserves are u64. Using toNumber() might lose precision
        // for extremely large values exceeding JavaScript's MAX_SAFE_INTEGER.
        // Consider using BN.js if precision is critical for downstream calculations.
        const baseMint = poolState.baseMint.toString();
        const quoteMint = poolState.quoteMint.toString();
        const baseReserve = poolState.baseReserve.toNumber();
        const quoteReserve = poolState.quoteReserve.toNumber();
        return {
            baseMint,
            quoteMint,
            baseReserve,
            quoteReserve,
        };
    }
    catch (error) {
        logger_1.default.error('Failed to fetch liquidity/pool details.');
        logger_1.default.error(`Full Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
        return null;
    }
}
runEvaluation();
//# sourceMappingURL=test-evaluation.js.map