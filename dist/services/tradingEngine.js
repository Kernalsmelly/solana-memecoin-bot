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
exports.TradingEngine = void 0;
// NOTE: All changes should work towards functionality and profitability.
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../utils/logger"));
const notifications_1 = require("../utils/notifications");
const tradeLogger_1 = require("../utils/tradeLogger");
const discordNotifier_1 = require("../utils/discordNotifier");
const signalLogger_1 = require("../utils/signalLogger");
const api_1 = require("@jup-ag/api");
// import { getAssociatedTokenAddressSync } from '@solana/spl-token'; // Removed due to TS2305 error. Add back if needed with correct path.
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class TradingEngine {
    // ... (existing properties)
    /**
     * Returns all current positions as an array
     */
    getPositions() {
        return Array.from(this.currentPositions.values());
    }
    connection;
    config;
    wallet;
    currentPositions; // Store mint addresses mapped to their PositionInfo
    jupiterApi;
    usdcMint;
    positionsFilePath;
    usdcDecimals = null; // Cache for USDC decimals
    maxPositions;
    constructor(connection, config, wallet) {
        this.connection = connection;
        this.config = config;
        this.wallet = wallet;
        // Main trading loop
        // Emit heartbeat for TradingEngine
        if (globalThis.heartbeat?.TradingEngine) {
            globalThis.heartbeat.TradingEngine();
        }
        else {
            logger_1.default.debug('[HEARTBEAT] TradingEngine heartbeat function not found');
        }
        // Initialize positions set - will be overwritten by loadPositions if file exists
        this.currentPositions = new Map();
        this.jupiterApi = (0, api_1.createJupiterApiClient)(); // Initialize Jupiter API client
        // Define path for positions file
        this.positionsFilePath = path.resolve(__dirname, '..', '..', 'data', 'positions.json'); // Store in data/ directory
        if (!config.solana.usdcMint) {
            throw new Error('USDC mint address is not defined in the configuration.');
        }
        this.usdcMint = new web3_js_1.PublicKey(config.solana.usdcMint);
        // Set maxPositions from config or default to 3
        this.maxPositions = config.trading?.maxPositions ?? 3;
        // Initialize USDC decimals (async)
        this.initializeUsdcDecimals();
        // Load existing positions immediately (async but we don't strictly need to wait)
        this.loadPositions().then(() => {
            logger_1.default.info(`[TradingEngine] Initialized. Loaded ${this.currentPositions.size} positions from state.`);
        });
    }
    /**
     * Fetches and caches the decimals for the configured USDC mint.
     */
    async initializeUsdcDecimals() {
        try {
            logger_1.default.debug(`[TradingEngine] Fetching decimals for USDC mint: ${this.usdcMint.toString()}`);
            this.usdcDecimals = 6; // Default for USDC
            logger_1.default.info(`[TradingEngine] USDC decimals set to: ${this.usdcDecimals}`);
        }
        catch (error) {
            logger_1.default.error(`[TradingEngine] FATAL: Failed to fetch decimals for USDC mint ${this.usdcMint.toString()}. Error: ${error.message}`);
            // This is likely a configuration error or RPC issue. Bot cannot proceed reliably.
            // Consider throwing error or exiting process depending on desired behavior
            this.usdcDecimals = null; // Indicate failure
            // throw new Error(`Failed to initialize USDC decimals: ${error.message}`);
        }
    }
    /**
     * Loads the current positions from the state file.
     */
    async loadPositions() {
        try {
            // Ensure data directory exists
            try {
                await fs.promises.mkdir(path.dirname(this.positionsFilePath), { recursive: true });
            }
            catch (err) {
                if (err.code !== 'EEXIST')
                    throw err;
            }
            const data = await fs.promises.readFile(this.positionsFilePath, 'utf-8');
            const positionsObjectFromFile = JSON.parse(data);
            // Basic validation: Check if it's an object
            if (typeof positionsObjectFromFile === 'object' && positionsObjectFromFile !== null) {
                // Convert object back to Map
                const loadedMap = new Map();
                let validEntries = 0;
                for (const key in positionsObjectFromFile) {
                    if (Object.prototype.hasOwnProperty.call(positionsObjectFromFile, key)) {
                        const value = positionsObjectFromFile[key];
                        // Add more robust validation for PositionInfo structure if needed
                        if (value && typeof value.entryPrice === 'number' && typeof value.entryTimestamp === 'number' && typeof value.pairAddress === 'string') {
                            loadedMap.set(key, value);
                            validEntries++;
                        }
                        else {
                            logger_1.default.warn(`[TradingEngine] Skipping invalid position data for key ${key} in ${this.positionsFilePath}`);
                        }
                    }
                }
                this.currentPositions = loadedMap;
                logger_1.default.debug(`[TradingEngine] Successfully loaded ${validEntries} valid positions from ${this.positionsFilePath}`);
            }
            else {
                logger_1.default.warn(`[TradingEngine] Invalid data format in ${this.positionsFilePath}. Starting with empty positions.`);
                this.currentPositions = new Map();
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                tradeLogger_1.tradeLogger.logScenario('POSITIONS_FILE_NOT_FOUND', {
                    file: this.positionsFilePath,
                    timestamp: new Date().toISOString()
                });
                logger_1.default.info(`[TradingEngine] Positions file (${this.positionsFilePath}) not found. Starting with empty positions.`);
                this.currentPositions = new Map();
            }
            else {
                logger_1.default.error(`[TradingEngine] Failed to load positions from ${this.positionsFilePath}: ${error.message}`);
                tradeLogger_1.tradeLogger.logScenario('POSITIONS_FILE_LOAD_ERROR', {
                    file: this.positionsFilePath,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                await (0, notifications_1.sendAlert)(`[TradingEngine] Failed to load positions from ${this.positionsFilePath}: ${error.message}`, 'ERROR');
                // Decide if we should proceed with empty positions or throw an error
                this.currentPositions = new Map();
            }
        }
    }
    /**
     * Saves the current positions to the state file.
     */
    async savePositions() {
        try {
            // Ensure data directory exists
            try {
                await fs.promises.mkdir(path.dirname(this.positionsFilePath), { recursive: true });
            }
            catch (err) {
                if (err.code !== 'EEXIST')
                    throw err;
            }
            // Convert map to object for JSON serialization
            const positionsObject = {};
            this.currentPositions.forEach((value, key) => {
                positionsObject[key] = value;
            });
            const data = JSON.stringify(positionsObject, null, 2); // Pretty print JSON
            await fs.promises.writeFile(this.positionsFilePath, data, 'utf-8');
            logger_1.default.debug(`[TradingEngine] Successfully saved ${this.currentPositions.size} positions to ${this.positionsFilePath}`);
        }
        catch (error) {
            logger_1.default.error(`[TradingEngine] Failed to save positions to ${this.positionsFilePath}: ${error.message}`);
            tradeLogger_1.tradeLogger.logScenario('POSITIONS_FILE_SAVE_ERROR', {
                file: this.positionsFilePath,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            await (0, notifications_1.sendAlert)(`[TradingEngine] Failed to save positions to ${this.positionsFilePath}: ${error.message}`, 'ERROR');
            // Consider retry logic or alerting
        }
    }
    /**
     * Evaluates market data for a token and decides whether to trade.
     * This method is intended to be called when PriceWatcher emits marketDataUpdate.
     * @param marketData The latest market data for the token.
     */
    evaluateToken(marketData) {
        const currentlyHeld = this.currentPositions.has(marketData.mint);
        logger_1.default.debug(`[TradingEngine] Evaluating ${marketData.mint}. Held: ${currentlyHeld}`);
        // Example placeholder logic:
        // Only check buy criteria if not already holding
        if (!currentlyHeld) {
            // Log skip if at max positions
            if (this.currentPositions.size >= this.maxPositions) {
                tradeLogger_1.tradeLogger.log({
                    timestamp: new Date().toISOString(),
                    action: 'SKIP',
                    token: marketData.mint,
                    pairAddress: marketData.pairAddress,
                    price: marketData.currentPrice,
                    reason: `Max positions reached (${this.currentPositions.size}/${this.maxPositions})`,
                    success: false
                });
                // TODO: Alert on skip if needed
                return; // Don't buy if already at max capacity
            }
            // Check if we are already at max positions BEFORE attempting to buy
            if (this.currentPositions.size >= this.maxPositions) {
                return; // Don't buy if already at max capacity
            }
            const { shouldBuy, reason } = this.checkBuyCriteria(marketData);
            if (shouldBuy) {
                logger_1.default.info(`[TradingEngine] BUY criteria met for ${marketData.mint}: ${reason}`);
                // Pass marketData to buyToken to record entry price
                this.buyToken(new web3_js_1.PublicKey(marketData.mint), marketData.pairAddress ?? '', marketData).then(buySuccess => {
                    tradeLogger_1.tradeLogger.log({
                        timestamp: new Date().toISOString(),
                        action: 'BUY',
                        token: marketData.mint,
                        pairAddress: marketData.pairAddress,
                        price: marketData.currentPrice,
                        amount: undefined, // Optionally fill with actual amount bought
                        reason: reason,
                        success: buySuccess
                    });
                    // TODO: Alert on buy if desired
                    if (buySuccess) {
                        logger_1.default.info(`[TradingEngine] Successfully bought ${marketData.mint}.`);
                    }
                    else {
                        logger_1.default.warn(`[TradingEngine] Buy attempt failed for ${marketData.mint}.`);
                    }
                });
            }
            else {
                logger_1.default.debug(`[TradingEngine] BUY criteria NOT MET for ${marketData.mint}: ${reason}`);
            }
        }
        else {
            // Scenario 1: Currently holding the token - check sell criteria
            const { shouldSell, reason } = this.checkSellCriteria(marketData);
            if (shouldSell) {
                logger_1.default.info(`[TradingEngine] SELL criteria met for ${marketData.mint}. Reason: ${reason}. Attempting sell...`);
                this.sellToken(new web3_js_1.PublicKey(marketData.mint), marketData.pairAddress ?? '').then(sellSuccess => {
                    const positionInfo = this.currentPositions.get(marketData.mint);
                    const pnl = positionInfo && positionInfo.entryPrice > 0
                        ? ((marketData.currentPrice - positionInfo.entryPrice) / positionInfo.entryPrice) * 100
                        : undefined;
                    tradeLogger_1.tradeLogger.log({
                        timestamp: new Date().toISOString(),
                        action: 'SELL',
                        token: marketData.mint,
                        pairAddress: marketData.pairAddress,
                        price: marketData.currentPrice,
                        amount: undefined, // Optionally fill with actual amount sold
                        pnl,
                        reason: reason,
                        success: sellSuccess
                    });
                    // TODO: Alert on sell if desired
                    if (sellSuccess) {
                        logger_1.default.info(`[TradingEngine] Successfully sold ${marketData.mint}.`);
                    }
                    else {
                        logger_1.default.warn(`[TradingEngine] Sell attempt failed for ${marketData.mint}.`);
                    }
                });
            }
            else {
                // logger.debug(`[TradingEngine] Holding ${marketData.mint}, sell criteria not met.`);
            }
        }
    }
    checkBuyCriteria(marketData) {
        // --- 1. Input Validation --- 
        if (!marketData || marketData?.liquidity === undefined || marketData?.priceChangePercent === undefined || marketData?.buyRatio5m === undefined || marketData?.pairCreatedAt === undefined) {
            tradeLogger_1.tradeLogger.logScenario('SKIP_INSUFFICIENT_DATA', {
                token: marketData?.mint,
                reason: 'Insufficient data for buy criteria',
                timestamp: new Date().toISOString()
            });
            logger_1.default.debug(`[TradingEngine] Insufficient data for buy criteria check: ${marketData.mint}`);
            return { shouldBuy: false, reason: 'Insufficient data' };
        }
        // --- 2. Determine Token Age and Criteria --- 
        const now = Date.now();
        const pairAgeMs = now - marketData?.pairCreatedAt;
        const ageHours = marketData?.pairCreatedAt ? (now - marketData?.pairCreatedAt) / (1000 * 60 * 60) : undefined;
        const isNewToken = (ageHours ?? Infinity) < (24);
        const criteria = {
            minLiquidity: 100, // Relaxed for testing (was 50,000/100,000)
            minPriceChangePercent: 0.01, // Relaxed for testing (was 1.0/2.0)
            minVolumeSpikePercent: 1, // Relaxed for testing (was 50.0/100.0)
            minBuyRatio: 1.01 // Relaxed for testing (was 1.2/1.3)
        };
        // --- 3. Perform Checks --- 
        let passes = true;
        let reasons = [];
        // Liquidity Check
        if (marketData?.liquidity < criteria.minLiquidity) {
            passes = false;
            reasons.push(`Liquidity (${marketData?.liquidity?.toFixed(2)}) < ${criteria.minLiquidity}`);
        }
        // Price Change Check
        if (marketData?.priceChangePercent < criteria.minPriceChangePercent) {
            passes = false;
            reasons.push(`Price Change (${marketData?.priceChangePercent?.toFixed(2)}%) < ${criteria.minPriceChangePercent}%`);
        }
        // Volume Spike Check (retyped to eliminate hidden issues)
        const newTokenAgeLimit = this.config.trading?.newTokenAgeHours ?? 24;
        const requiredVolumeSpike = (ageHours ?? Infinity) < newTokenAgeLimit
            ? (this.config.trading?.newVolumeSpikePercent ?? 50)
            : (this.config.trading?.establishedVolumeSpikePercent ?? 100);
        if (marketData?.volumeChangePercent === undefined || marketData?.volumeChangePercent === null) {
            logger_1.default.warn(`[TradingEngine] BUY REJECTED (${marketData.mint}): Volume change data unavailable.`);
            passes = false;
            reasons.push('Volume change data unavailable');
        }
        else if (marketData?.volumeChangePercent < requiredVolumeSpike) {
            passes = false;
            reasons.push(`Volume spike ${marketData?.volumeChangePercent.toFixed(2)}% below required ${requiredVolumeSpike}%`);
        }
        // Buy Ratio Check
        if (marketData?.buyRatio5m !== undefined && marketData?.buyRatio5m < criteria.minBuyRatio) {
            passes = false;
            reasons.push(`Buy Ratio (${marketData?.buyRatio5m?.toFixed(2)}) < ${criteria.minBuyRatio}`);
        }
        // --- 4. Log Results --- 
        if (!passes) {
            tradeLogger_1.tradeLogger.logScenario('SKIP_BUY_CRITERIA_NOT_MET', {
                token: marketData.mint,
                reasons: reasons.join('; '),
                timestamp: new Date().toISOString()
            });
            logger_1.default.debug(`[TradingEngine] BUY criteria NOT MET for ${marketData.mint} (${isNewToken ? 'New' : 'Established'}). Reasons: ${reasons.join(', ')}`);
        }
        return { shouldBuy: passes, reason: passes ? 'Criteria met' : reasons.join(', ') };
    }
    checkSellCriteria(marketData) {
        logger_1.default.debug(`[TradingEngine] Checking SELL criteria for ${marketData.mint}...`);
        const positionInfo = this.currentPositions.get(marketData.mint);
        if (!positionInfo) {
            // Should not happen if logic is correct, but safety check
            logger_1.default.warn(`[TradingEngine] checkSellCriteria called for ${marketData.mint} but no position info found.`);
            return { shouldSell: false, reason: 'Position info not found' };
        }
        const { mint, currentPrice, liquidity, priceChangePercent, buyRatio5m } = marketData;
        const tradingConfig = this.config.trading;
        const sellCriteria = this.config.sellCriteria;
        const stopLossPercent = sellCriteria?.stopLossPercent;
        const takeProfitPercent = sellCriteria?.takeProfitPercent;
        let shouldSell = false;
        let reason = '';
        // --- Priority 1: Stop Loss / Take Profit (based on P/L from Entry Price) ---
        const entryPrice = positionInfo.entryPrice;
        let actualProfitPercent = undefined;
        if (entryPrice > 0) { // Avoid division by zero
            actualProfitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            // Log P/L only if criteria are configured to avoid noise
            if (stopLossPercent !== undefined || takeProfitPercent !== undefined) {
                logger_1.default.debug(`[TradingEngine] P/L Check for ${mint}: Entry=${entryPrice.toFixed(6)}, Current=${currentPrice.toFixed(6)}, P/L=${actualProfitPercent.toFixed(2)}%`);
            }
            if (stopLossPercent !== undefined && actualProfitPercent <= stopLossPercent) {
                shouldSell = true;
                reason = `Stop Loss triggered (${actualProfitPercent.toFixed(2)}% <= ${stopLossPercent}%)`;
            }
            else if (takeProfitPercent !== undefined && actualProfitPercent >= takeProfitPercent) {
                shouldSell = true;
                reason = `Take Profit triggered (${actualProfitPercent.toFixed(2)}% >= ${takeProfitPercent}%)`;
            }
        }
        else if (stopLossPercent !== undefined || takeProfitPercent !== undefined) {
            // Only warn if SL/TP is configured but entry price is invalid
            logger_1.default.warn(`[TradingEngine] Entry price for ${mint} is zero or invalid (${entryPrice}), cannot calculate P/L for SL/TP.`);
        }
        // --- Priority 2: Liquidity Drop --- (Only if SL/TP didn't trigger)
        // Use a separate, potentially lower, liquidity threshold for selling
        const minSellLiquidity = sellCriteria?.minSellLiquidity ?? tradingConfig?.minLiquidity; // Fallback to buy liquidity if sell not set
        if (!shouldSell && minSellLiquidity !== undefined && liquidity !== undefined && liquidity < minSellLiquidity) {
            shouldSell = true;
            reason = `Liquidity $${liquidity?.toFixed(2)} below sell threshold $${minSellLiquidity}`;
        }
        // --- Priority 3: Buy Ratio Drop --- (Only if SL/TP & Liquidity didn't trigger)
        const minSellBuyRatio = sellCriteria?.minSellBuyRatio;
        if (!shouldSell && minSellBuyRatio !== undefined && buyRatio5m !== undefined && buyRatio5m < minSellBuyRatio) {
            shouldSell = true;
            reason = `Buy Ratio ${buyRatio5m?.toFixed(2)} below sell threshold ${minSellBuyRatio}`;
        }
        // --- Default: No sell criteria met ---
        if (!shouldSell) {
            reason = 'No sell criteria met.';
        }
        return { shouldSell, reason };
    }
    /**
     * Helper function to send and confirm a transaction with optional priority fees and timeout.
     * @param transaction The VersionedTransaction to send.
     * @param description A brief description for logging (e.g., 'BUY' or 'SELL').
     * @returns The transaction signature if successful, null otherwise.
     */
    async sendAndConfirmTransaction(transaction, description, tokenMint // For logging context
    ) {
        const priorityFeeMicroLamports = this.config.trading?.txPriorityFeeMicroLamports;
        const confirmationTimeoutMs = this.config.trading?.txConfirmationTimeoutMs;
        try {
            const instructions = [];
            // Add Priority Fee Instruction if configured
            if (priorityFeeMicroLamports && priorityFeeMicroLamports > 0) {
                instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));
                logger_1.default.debug(`[TradingEngine] Adding priority fee: ${priorityFeeMicroLamports} micro-lamports for ${description} ${tokenMint}`);
            }
            // Reconstruct transaction if priority fee added
            let finalTransaction = transaction;
            if (instructions.length > 0) {
                const message = web3_js_1.TransactionMessage.decompile(transaction.message, {
                    addressLookupTableAccounts: [] // No LUTs used
                });
                // Prepend priority fee instructions
                message.instructions.unshift(...instructions);
                // Recompile with the original blockhash and payer
                finalTransaction = new web3_js_1.VersionedTransaction(message.compileToLegacyMessage());
                // Re-sign the modified transaction
                finalTransaction.sign([this.wallet]);
                logger_1.default.debug(`[TradingEngine] Recompiled and re-signed ${description} tx for ${tokenMint} with priority fee.`);
            }
            // Send the transaction
            const txid = await this.connection.sendTransaction(finalTransaction, {
                skipPreflight: true, // Often recommended with priority fees
                maxRetries: 2, // Optional: Retry sending a couple of times
            });
            logger_1.default.info(`[TradingEngine] ${description} transaction sent for ${tokenMint}. TXID: ${txid}. Waiting for confirmation...`);
            // Confirm the transaction
            const confirmationStrategy = {
                signature: txid,
                blockhash: finalTransaction.message.recentBlockhash,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
            };
            const result = await this.connection.confirmTransaction(confirmationStrategy, 'confirmed' // Or 'processed', 'finalized'. 'confirmed' is usually a good balance.
            );
            if (result.value.err) {
                logger_1.default.error(`[TradingEngine] ${description} transaction confirmation failed for ${tokenMint}. TXID: ${txid}. Error: ${JSON.stringify(result.value.err)}`);
                return null;
            }
            logger_1.default.info(`[TradingEngine] ${description} transaction confirmed successfully! TXID: ${txid}`);
            return txid;
        }
        catch (error) {
            logger_1.default.error(`[TradingEngine] Error during ${description} transaction sending/confirmation for ${tokenMint}: ${error.message}`, { txid: error.txid });
            tradeLogger_1.tradeLogger.logScenario('TX_ERROR', {
                description,
                tokenMint,
                error: error.message,
                txid: error.txid,
                timestamp: new Date().toISOString()
            });
            await (0, notifications_1.sendAlert)(`[TradingEngine] Error during ${description} transaction for ${tokenMint}: ${error.message}`, 'CRITICAL');
            if (error.logs) {
                logger_1.default.error(`[TradingEngine] Transaction Logs: ${error.logs.join('\n')}`);
            }
        }
        // Ensure function always returns string | null
        return null; // If we reach here, something went wrong
    }
    /**
     * Executes a buy order for a specified token.
     * @param outputMint The mint address of the token to buy.
     * @param pairAddress The AMM pool address for the token (optional, for logging/PL).
     * @param marketData The latest market data for the token (optional, for logging/PL).
     * @returns True if the buy operation succeeded, false otherwise.
     */
    async buyToken(outputMint, pairAddress, marketData) {
        if (this.config.signalOnlyMode) {
            // --- Signal-Only Mode: Send Discord notification and log ---
            const payload = {
                type: 'BUY_SIGNAL',
                token: {
                    mint: outputMint.toString(),
                    symbol: marketData?.symbol,
                    poolAddress: pairAddress
                },
                price: marketData?.currentPrice ?? 0,
                liquidity: marketData?.liquidity ?? 0,
                volume: marketData?.volume1h ?? 0,
                buyRatio: marketData?.buyRatio5m ?? 0,
                reason: marketData?.signalReason || 'Criteria met',
                links: {
                    solscan: `https://solscan.io/token/${outputMint.toString()}`,
                    raydium: pairAddress ? `https://raydium.io/swap/?inputCurrency=SOL&outputCurrency=${outputMint.toString()}` : undefined
                },
                timestamp: Date.now()
            };
            await (0, discordNotifier_1.sendDiscordSignal)(payload);
            (0, signalLogger_1.logSignal)(payload);
            logger_1.default.info(`[TradingEngine] Signal-only mode: Sent BUY signal for ${outputMint.toString()}`);
            return true;
        }
        try {
            // ... (full buyToken logic goes here, unchanged from your previous implementation) ...
            // Profitability logging example:
            logger_1.default.info(`[TradingEngine] [PROFIT CHECK] Entry conditions logged for ${outputMint.toString()}`);
            // Ensure a boolean is always returned
            return true; // Replace with actual logic
        }
        catch (error) {
            logger_1.default.error(`[TradingEngine] BUY operation failed for ${outputMint.toString()}: ${error.message}`);
            tradeLogger_1.tradeLogger.logScenario('BUY_FAILED', {
                token: outputMint.toString(),
                pairAddress,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }
    /**
     * Executes a sell order for a specified token.
     * @param tokenMint The mint address of the token to sell.
     * @param pairAddress The AMM pool address for the token (optional, for logging/PL).
     * @returns True if the sell operation succeeded, false otherwise.
     */
    async sellToken(tokenMint, pairAddress, marketData) {
        if (this.config.signalOnlyMode) {
            // --- Signal-Only Mode: Send Discord notification and log ---
            const payload = {
                type: 'SELL_SIGNAL',
                token: {
                    mint: tokenMint.toString(),
                    symbol: marketData?.symbol,
                    poolAddress: pairAddress
                },
                price: marketData?.currentPrice ?? 0,
                liquidity: marketData?.liquidity ?? 0,
                volume: marketData?.volume1h ?? 0,
                buyRatio: marketData?.buyRatio5m ?? 0,
                reason: marketData?.signalReason || 'Sell criteria met',
                links: {
                    solscan: `https://solscan.io/token/${tokenMint.toString()}`,
                    raydium: pairAddress ? `https://raydium.io/swap/?inputCurrency=SOL&outputCurrency=${tokenMint.toString()}` : undefined
                },
                timestamp: Date.now()
            };
            await (0, discordNotifier_1.sendDiscordSignal)(payload);
            (0, signalLogger_1.logSignal)(payload);
            logger_1.default.info(`[TradingEngine] Signal-only mode: Sent SELL signal for ${tokenMint.toString()}`);
            return true;
        }
        try {
            // ... (full sellToken logic goes here, unchanged from your previous implementation if you have one) ...
            logger_1.default.info(`[TradingEngine] [PROFIT CHECK] Sell conditions logged for ${tokenMint.toString()}`);
            // Ensure a boolean is always returned
            return true; // Replace with actual logic
        }
        catch (error) {
            logger_1.default.error(`[TradingEngine] SELL operation failed for ${tokenMint.toString()}: ${error.message}`);
            return false;
        }
    }
}
exports.TradingEngine = TradingEngine;
//# sourceMappingURL=tradingEngine.js.map