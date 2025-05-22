"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceWatcher = void 0;
// src/services/priceWatcher.ts
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../utils/logger"));
const events_1 = require("events");
const api_1 = require("@jup-ag/api");
const axios_1 = __importDefault(require("axios"));
const priceHistoryLogger_1 = require("../utils/priceHistoryLogger");
class PriceWatcher extends events_1.EventEmitter {
    connection;
    config;
    jupiterApi;
    watchedTokens = new Map();
    tokenDecimalsCache = new Map();
    pollIntervalId = null;
    pollIntervalMs = 5000;
    maxPollingErrors = 5;
    constructor(connection, config) {
        super();
        this.connection = connection;
        this.config = config;
        this.jupiterApi = (0, api_1.createJupiterApiClient)();
        logger_1.default.info('PriceWatcher initialized.');
        this.cacheQuoteTokenDecimals();
        // TODO: Initialize Dexscreener client if needed (e.g., axios instance)
    }
    async cacheQuoteTokenDecimals() {
        // Use the canonical SOL and USDT mint constants
        const SOL_MINT = "So11111111111111111111111111111111111111112";
        const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
        const quoteMints = [
            SOL_MINT,
            this.config.solana.usdcMint,
            USDT_MINT
        ].filter(mint => !!mint);
        for (const mint of quoteMints) {
            if (mint) {
                try {
                    await this.getTokenDecimals(mint);
                }
                catch (error) {
                    logger_1.default.warn(`[PriceWatcher] Failed to pre-cache decimals for quote mint ${mint}: ${error}`);
                }
            }
        }
    }
    async getTokenDecimals(mintAddress) {
        if (this.tokenDecimalsCache.has(mintAddress)) {
            return this.tokenDecimalsCache.get(mintAddress);
        }
        logger_1.default.debug(`[PriceWatcher] Fetching decimals for mint: ${mintAddress}`);
        try {
            const mintPublicKey = new web3_js_1.PublicKey(mintAddress);
            const info = await this.connection.getParsedAccountInfo(mintPublicKey, 'confirmed');
            if (!info || !info.value || typeof info.value.data !== 'object' || info.value.data === null || !('parsed' in info.value.data)) {
                throw new Error('Invalid or missing account info structure received.');
            }
            const parsedData = info.value.data.parsed;
            if (typeof parsedData === 'object' && parsedData !== null && 'info' in parsedData && typeof parsedData.info === 'object' && parsedData.info !== null && 'decimals' in parsedData.info && typeof parsedData.info.decimals === 'number') {
                const decimals = parsedData.info.decimals;
                this.tokenDecimalsCache.set(mintAddress, decimals);
                logger_1.default.debug(`[PriceWatcher] Cached decimals for ${mintAddress}: ${decimals}`);
                return decimals;
            }
            else {
                logger_1.default.warn(`[PriceWatcher] Parsed account info structure invalid for ${mintAddress}`, { parsedData });
                throw new Error('Parsed account info does not contain decimals.');
            }
        }
        catch (error) {
            logger_1.default.error(`[PriceWatcher] Failed to fetch decimals for ${mintAddress}: ${error.message}`);
            throw error;
        }
    }
    start() {
        if (this.pollIntervalId) {
            logger_1.default.warn('PriceWatcher polling already active.');
            return;
        }
        logger_1.default.info(`Starting PriceWatcher polling every ${this.pollIntervalMs}ms.`);
        // Use setInterval to repeatedly call pollWatchedTokens
        this.pollIntervalId = setInterval(() => {
            this.pollWatchedTokens().catch(error => {
                // Catch errors from the async pollWatchedTokens to prevent interval from stopping
                logger_1.default.error(`[PriceWatcher] Uncaught error during pollWatchedTokens execution: ${error.message}`);
            });
        }, this.pollIntervalMs);
    }
    stop() {
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
            logger_1.default.info('Stopped PriceWatcher polling.');
        }
    }
    // Modified to accept optional pairAddress from detection event
    watchToken(mintAddress, pairAddress) {
        if (!this.watchedTokens.has(mintAddress)) {
            logger_1.default.info(`[PriceWatcher] Starting to watch token: ${mintAddress}${pairAddress ? ` (Pair: ${pairAddress})` : ''}`);
            this.watchedTokens.set(mintAddress, {
                mint: mintAddress,
                pairAddress: pairAddress, // Store pair address if provided
                priceHistory: [],
                volumeHistory: [], // Initialize volume history
                errorCount: 0, // Initialize error count
                lastCheckTimestamp: Date.now()
            });
            // Trigger an immediate poll for this new token to get initial data
            this.pollSingleToken(mintAddress).catch(error => {
                logger_1.default.error(`[PriceWatcher] Initial poll failed for ${mintAddress}: ${error.message}`);
                // Optional: Unwatch if initial poll fails severely? Maybe increment error count here too.
                const data = this.watchedTokens.get(mintAddress);
                if (data)
                    data.errorCount++;
            });
        }
        else {
            // If already watching, maybe update the pair address if it wasn't known before?
            const existingData = this.watchedTokens.get(mintAddress);
            if (existingData && !existingData.pairAddress && pairAddress) {
                existingData.pairAddress = pairAddress;
                logger_1.default.info(`[PriceWatcher] Updated pair address for already watched token ${mintAddress} to ${pairAddress}`);
            }
        }
    }
    unwatchToken(mintAddress) {
        if (this.watchedTokens.has(mintAddress)) {
            logger_1.default.info(`[PriceWatcher] Stopping watch for token: ${mintAddress}`);
            this.watchedTokens.delete(mintAddress);
        }
    }
    async pollWatchedTokens() {
        if (this.watchedTokens.size === 0) {
            return; // Nothing to poll
        }
        // Avoid logging this every 5s if many tokens are watched
        // logger.debug(`[PriceWatcher] Polling ${this.watchedTokens.size} watched tokens...`);
        const pollPromises = Array.from(this.watchedTokens.keys()).map(mint => this.pollSingleToken(mint));
        // Use allSettled to ensure one failure doesn't stop others
        const results = await Promise.allSettled(pollPromises);
        // Optional: Log aggregate results or handle errors from allSettled
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const mint = Array.from(this.watchedTokens.keys())[index];
                logger_1.default.warn(`[PriceWatcher] Polling promise rejected for ${mint}: ${result.reason}`);
                // Error handling is also done within pollSingleToken, this is an extra safety net
            }
        });
    }
    async pollSingleToken(mintAddress) {
        const tokenData = this.watchedTokens.get(mintAddress);
        if (!tokenData) {
            // This can happen if unwatchToken was called between pollWatchedTokens start and this execution
            // logger.warn(`[PriceWatcher] Attempted to poll unwatched token: ${mintAddress}`);
            return;
        }
        try {
            // --- Ensure Decimals are Known ---
            if (tokenData.decimals === undefined) {
                tokenData.decimals = await this.getTokenDecimals(mintAddress);
            }
            const inputDecimals = tokenData.decimals;
            // --- 1. Get Price (via Jupiter) ---
            const quoteMint = this.config.solana.usdcMint;
            if (!quoteMint) {
                logger_1.default.error(`[PriceWatcher] No quote mint specified in config for price fetching.`);
                return;
            }
            const currentPrice = await this.fetchJupiterPrice(mintAddress, quoteMint, inputDecimals);
            tokenData.lastPrice = currentPrice;
            tokenData.priceHistory.push({ timestamp: Date.now(), price: currentPrice });
            this.trimHistory(tokenData.priceHistory, 5 * 60 * 1000); // Keep ~5 mins of price history
            // --- 2. Get Pair Data (e.g., via Dexscreener) ---
            let pairData = null;
            if (tokenData.pairAddress) {
                pairData = await this.fetchDexscreenerData(tokenData.pairAddress, 'pair');
                if (!pairData && tokenData.errorCount < this.maxPollingErrors) { // If fetch by pair fails, try token search once?
                    logger_1.default.warn(`[PriceWatcher] Failed to fetch Dexscreener by pair ${tokenData.pairAddress}, trying token search for ${mintAddress}`);
                    pairData = await this.fetchDexscreenerData(mintAddress, 'token');
                }
            }
            else {
                logger_1.default.debug(`[PriceWatcher] No pair address for ${mintAddress}, attempting Dexscreener search by token...`);
                pairData = await this.fetchDexscreenerData(mintAddress, 'token');
                // If search finds a pair, update our stored data
                if (pairData?.pairAddress && !tokenData.pairAddress) {
                    logger_1.default.info(`[PriceWatcher] Found pair address ${pairData.pairAddress} for ${mintAddress} via token search.`);
                    tokenData.pairAddress = pairData.pairAddress;
                }
            }
            // --- 3. Update State & Calculate Metrics ---
            if (pairData?.liquidity?.usd !== undefined) {
                tokenData.liquidity = pairData.liquidity.usd;
            }
            if (pairData?.volume?.h1 !== undefined) { // Example: track h1 volume
                tokenData.volumeHistory.push({ timestamp: Date.now(), volume: pairData.volume.h1 });
                this.trimHistory(tokenData.volumeHistory, 6 * 60 * 60 * 1000); // Keep ~6 hrs volume
            }
            // --- 3.5. Log to price history ---
            (0, priceHistoryLogger_1.logPriceHistory)({
                timestamp: Date.now(),
                token: mintAddress,
                poolAddress: tokenData.pairAddress,
                price: currentPrice,
                liquidity: tokenData.liquidity,
                volume: pairData?.volume?.h1
            });
            const priceChange1m = this.calculatePriceChange(tokenData.priceHistory, 60 * 1000); // 1 minute
            const priceChangePercent = this.calculatePriceChange(tokenData.priceHistory, 5 * 60 * 1000); // 5 minutes
            const volumeChangePercent = this.calculateVolumeChangePercent(tokenData.volumeHistory, 15 * 60 * 1000); // 15 minutes
            // TODO: Add volume change calculation if needed for strategy
            // const volumeChange1h = this.calculateVolumeChange(tokenData.volumeHistory, 60 * 60 * 1000); // 1 hour
            const buyRatio5m = this.calculateBuyRatio(pairData, 'm5'); // 5 minutes
            const updateEventData = {
                mint: mintAddress,
                pairAddress: tokenData.pairAddress,
                decimals: tokenData.decimals, // Include decimals in the event
                currentPrice: currentPrice,
                priceChangePercent: priceChangePercent,
                priceChange1m: priceChange1m,
                volume5m: pairData?.volume?.m5, // Pass through 5m volume if available
                volumeChangePercent: volumeChangePercent,
                liquidity: tokenData.liquidity ?? 0, // Use stored liquidity or 0
                buyRatio5m: buyRatio5m,
                pairCreatedAt: pairData?.pairCreatedAt // Add creation timestamp
            };
            // --- 4. Emit Event ---
            // Reduce log verbosity, maybe only log if change is significant?
            // logger.debug(`[PriceWatcher] Data update for ${mintAddress}: Price=${currentPrice.toFixed(6)}, Liq=${tokenData.liquidity?.toFixed(2)}, Change1m=${priceChange1m?.toFixed(2)}%, BuyRatio5m=${buyRatio5m?.toFixed(2)}`);
            this.emit('marketDataUpdate', updateEventData);
            // Reset error count on success
            tokenData.errorCount = 0;
            tokenData.lastCheckTimestamp = Date.now();
        }
        catch (error) {
            logger_1.default.error(`[PriceWatcher] Error polling token ${mintAddress}: ${error.message}`);
            // const tokenData = this.watchedTokens.get(mintAddress); // Already defined above
            // if (tokenData) { // Check if tokenData exists (it should)
            tokenData.errorCount++;
            logger_1.default.warn(`[PriceWatcher] Consecutive error count for ${mintAddress}: ${tokenData.errorCount}`);
            if (tokenData.errorCount >= this.maxPollingErrors) {
                logger_1.default.error(`[PriceWatcher] Exceeded max polling errors (${this.maxPollingErrors}) for ${mintAddress}. Unwatching.`);
                this.unwatchToken(mintAddress); // Stop watching after too many errors
            }
            // }
        }
    }
    // Updated Jupiter price fetching function
    async fetchJupiterPrice(inputMint, outputMint, inputDecimals) {
        // logger.debug(`[PriceWatcher] Fetching Jupiter price for ${inputMint} (${inputDecimals} dec) -> ${outputMint}`);
        // Get decimals for the output token (quote currency)
        const outputDecimals = await this.getTokenDecimals(outputMint);
        // Calculate amount for 1 whole unit of the input token in its smallest unit
        const amountInLamports = BigInt(1 * (10 ** inputDecimals));
        try {
            const quoteResponse = await this.jupiterApi.quoteGet({
                inputMint: inputMint,
                outputMint: outputMint,
                amount: amountInLamports.toString(), // Force type to resolve TS error
                // onlyDirectRoutes: true, // Consider for faster quotes? Might be less accurate.
                // slippageBps: 50
            });
            if (!quoteResponse || !quoteResponse.outAmount || quoteResponse.outAmount === "0") {
                throw new Error(`Invalid quote response or zero outAmount from Jupiter V6 for ${inputMint}`);
            }
            // Convert outAmount (string) to number for calculation
            const outAmountNum = Number(quoteResponse.outAmount);
            const price = outAmountNum / (10 ** outputDecimals);
            if (!isFinite(price) || price <= 0) {
                throw new Error(`Invalid calculated price from Jupiter quote: ${price}`);
            }
            return price;
        }
        catch (error) {
            // Improve error logging
            const errorMessage = error.message || 'Unknown error';
            // Avoid logging full error details every time unless necessary
            // const errorDetails = error.details || (error.response?.data) || error; 
            logger_1.default.error(`[PriceWatcher] Jupiter quote failed for ${inputMint} -> ${outputMint}: ${errorMessage}`);
            throw new Error(`Jupiter quote failed: ${errorMessage}`); // Re-throw cleaner error
        }
    }
    // Updated Dexscreener placeholder
    async fetchDexscreenerData(queryAddress, type) {
        let url;
        if (type === 'pair') {
            url = `https://api.dexscreener.com/latest/dex/pairs/solana/${queryAddress}`;
        }
        else { // type === 'token'
            url = `https://api.dexscreener.com/latest/dex/tokens/${queryAddress}`;
            // Note: Dexscreener token endpoint might return multiple pairs. We might need to select the most liquid/relevant one.
            // For simplicity, we'll aim to get the pair data from the first result if using token search.
        }
        logger_1.default.debug(`[PriceWatcher] Fetching Dexscreener data: ${url}`);
        try {
            const response = await axios_1.default.get(url, {
                timeout: 10000, // 10 second timeout
                headers: { 'Accept': 'application/json' }
            });
            if (response.status !== 200) {
                logger_1.default.warn(`[PriceWatcher] Dexscreener API returned non-200 status: ${response.status} for ${url}`);
                return null;
            }
            if (!response.data || !response.data.pairs) {
                // Dexscreener might return an empty object or missing pairs field for unknown tokens/pairs
                logger_1.default.warn(`[PriceWatcher] Dexscreener API returned no pairs data for ${url}`);
                return null;
            }
            // If searching by token, we get an array. Find the most liquid USDC/SOL pair if possible.
            // If searching by pair, we get a single pair object wrapped in the 'pairs' array.
            const pairs = response.data.pairs;
            if (!pairs || pairs.length === 0) {
                logger_1.default.warn(`[PriceWatcher] Dexscreener API returned empty pairs array for ${url}`);
                return null;
            }
            let targetPair = null;
            if (type === 'token') {
                // Prioritize USDC, then SOL pairs by liquidity
                targetPair = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
                    .find((p) => p.quoteToken?.address === this.config.solana.usdcMint || p.quoteToken?.symbol === 'SOL');
                if (!targetPair) {
                    targetPair = pairs[0]; // Fallback to the first (likely most liquid) pair
                    logger_1.default.debug(`[PriceWatcher] No primary quote pair (USDC/SOL) found via token search for ${queryAddress}, using most liquid: ${targetPair?.pairAddress}`);
                }
                else {
                    logger_1.default.debug(`[PriceWatcher] Found target pair ${targetPair.pairAddress} via token search for ${queryAddress}`);
                }
            }
            else {
                // If searching by pair, the API should return only that pair
                targetPair = pairs[0];
            }
            if (!targetPair) {
                logger_1.default.warn(`[PriceWatcher] Could not determine target pair from Dexscreener response for ${url}`);
                return null;
            }
            // Return the relevant pair object
            return targetPair;
        }
        catch (error) {
            const axiosError = error;
            if (axiosError.isAxiosError) {
                logger_1.default.error(`[PriceWatcher] Axios error fetching Dexscreener data for ${url}: ${axiosError.message}`, {
                    status: axiosError.response?.status,
                    data: axiosError.response?.data
                });
            }
            else {
                logger_1.default.error(`[PriceWatcher] Error fetching Dexscreener data for ${url}: ${error.message}`);
            }
            return null;
        }
    }
    // --- Calculation Helpers ---
    // Calculates % price change over a given duration
    calculatePriceChange(history, durationMs) {
        if (!history || history.length < 2)
            return undefined;
        const now = Date.now();
        const startTime = now - durationMs;
        // Ensure history is sorted by timestamp ASC (should be if pushed correctly)
        const sortedHistory = history.filter(entry => entry && typeof entry.timestamp === 'number' && typeof entry.price === 'number')
            .sort((a, b) => a.timestamp - b.timestamp);
        if (sortedHistory.length < 2)
            return undefined;
        const current = sortedHistory[sortedHistory.length - 1];
        if (!current)
            return undefined;
        // Find the latest entry that is *at or before* the startTime
        let startEntry = undefined;
        for (let i = sortedHistory.length - 1; i >= 0; i--) {
            const entry = sortedHistory[i];
            if (entry && typeof entry.timestamp === 'number' && entry.timestamp <= startTime) {
                startEntry = entry;
                break;
            }
        }
        // If no entry is old enough, use the oldest available entry? Or return undefined?
        // Let's use the oldest available if nothing matches startTime exactly
        if (!startEntry && sortedHistory.length > 0) {
            startEntry = sortedHistory[0];
            // Only calculate if oldest entry isn't too recent (e.g., within half the duration)
            if (!startEntry || startEntry.timestamp > now - durationMs / 2)
                return undefined;
        }
        if (!startEntry || startEntry.price === 0 || startEntry.timestamp === current.timestamp) {
            // Need a valid start price and different timestamps
            return undefined;
        }
        const priceChange = ((current.price - startEntry.price) / startEntry.price) * 100;
        // Sanity check for extreme values
        if (!isFinite(priceChange)) {
            logger_1.default.warn(`[PriceWatcher] Calculated infinite price change`, { current: current.price, start: startEntry.price });
            return undefined;
        }
        return priceChange;
    }
    // Calculates buy ratio (buys / sells) for a specific timeframe from Dexscreener data
    calculateBuyRatio(pairData, timeframe) {
        // Check nested structure safely
        const buys = pairData?.txns?.[timeframe]?.buys;
        const sells = pairData?.txns?.[timeframe]?.sells;
        if (typeof buys !== 'number' || typeof sells !== 'number' || sells === 0) {
            // If no sells, is ratio infinite? Or should we return undefined?
            // Let's return undefined for safety / clarity if sells=0 or data missing
            return undefined;
        }
        return buys / sells;
    }
    // Calculates the percentage change in volume over a specified duration from historical data.
    calculateVolumeChangePercent(history, durationMs) {
        if (!history || history.length < 2)
            return undefined;
        const now = Date.now();
        // Find the earliest entry within the window
        const startEntry = history.find(entry => entry && typeof entry.timestamp === 'number' && entry.timestamp > now - durationMs);
        const endEntry = history[history.length - 1];
        if (!startEntry || !endEntry)
            return undefined;
        if (startEntry.timestamp > now - durationMs / 2)
            return undefined;
        if (endEntry.volume === 0)
            return undefined;
        const changePercent = ((endEntry.volume - startEntry.volume) / startEntry.volume) * 100;
        return changePercent;
    }
    // Trims history arrays to keep only entries within maxAgeMs
    trimHistory(history, maxAgeMs) {
        if (!history || history.length === 0)
            return;
        const cutoffTimestamp = Date.now() - maxAgeMs;
        // Find the index of the first element to keep
        const startIndex = history.findIndex(entry => entry && typeof entry.timestamp === 'number' && entry.timestamp >= cutoffTimestamp);
        if (startIndex > 0) {
            // Remove elements before the startIndex
            history.splice(0, startIndex);
        }
        else if (startIndex === -1 &&
            history.length > 0) {
            const lastEntry = history.length > 0 ? history[history.length - 1] : undefined;
            if (lastEntry &&
                typeof lastEntry.timestamp === 'number' &&
                lastEntry.timestamp < cutoffTimestamp) {
                // If all elements are older than cutoff, clear the array
                history.length = 0;
            }
        }
        // If startIndex is 0, all elements are within the window, do nothing.
    }
}
exports.PriceWatcher = PriceWatcher;
//# sourceMappingURL=priceWatcher.js.map