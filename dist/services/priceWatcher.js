"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceWatcher = void 0;
const tradeLogger_1 = require("../utils/tradeLogger");
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../utils/logger"));
const notifications_1 = require("../utils/notifications");
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
    // Rate limiting properties
    rpcCallCount = 0;
    rpcCallResetTime = Date.now();
    MAX_RPC_CALLS_PER_MINUTE = 60; // Adjust as needed
    jupiterCallCount = 0;
    jupiterCallResetTime = Date.now();
    MAX_JUPITER_CALLS_PER_MINUTE = 30; // Jupiter has its own rate limits
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
        // Check rate limit before making RPC call
        if (!this.checkRpcRateLimit()) {
            logger_1.default.warn(`[PriceWatcher] RPC rate limit reached, using default decimals for ${mintAddress}`);
            // Use a default of 9 decimals if we can't fetch (common for SPL tokens)
            // This is better than failing completely
            return 9;
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
        // Use a longer polling interval to reduce API calls
        this.pollIntervalMs = 15000; // 15 seconds instead of 5 seconds
        logger_1.default.info(`Starting PriceWatcher polling every ${this.pollIntervalMs}ms with rate limiting.`);
        logger_1.default.info(`Max RPC calls: ${this.MAX_RPC_CALLS_PER_MINUTE}/min, Max Jupiter calls: ${this.MAX_JUPITER_CALLS_PER_MINUTE}/min`);
        // Use setInterval to repeatedly call pollWatchedTokens
        this.pollIntervalId = setInterval(() => {
            // Check if we're close to rate limits and potentially skip this cycle
            const rpcUtilization = this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE;
            const jupiterUtilization = this.jupiterCallCount / this.MAX_JUPITER_CALLS_PER_MINUTE;
            if (rpcUtilization > 0.9 || jupiterUtilization > 0.9) {
                logger_1.default.warn(`[RateLimit] Skipping poll cycle due to high API utilization - RPC: ${(rpcUtilization * 100).toFixed(0)}%, Jupiter: ${(jupiterUtilization * 100).toFixed(0)}%`);
                return;
            }
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
    /**
     * Rate limiter for RPC calls to prevent excessive QuickNode usage
     * @returns true if the call is allowed, false if it should be throttled
     */
    checkRpcRateLimit() {
        const now = Date.now();
        // Reset counter if a minute has passed
        if (now - this.rpcCallResetTime > 60000) {
            this.rpcCallCount = 0;
            this.rpcCallResetTime = now;
            return true;
        }
        // Check if we're over the limit
        if (this.rpcCallCount >= this.MAX_RPC_CALLS_PER_MINUTE) {
            logger_1.default.warn(`[RateLimit] RPC call limit reached (${this.MAX_RPC_CALLS_PER_MINUTE}/min). Throttling.`);
            return false;
        }
        // Increment counter and allow the call
        this.rpcCallCount++;
        return true;
    }
    /**
     * Rate limiter for Jupiter API calls
     * @returns true if the call is allowed, false if it should be throttled
     */
    checkJupiterRateLimit() {
        const now = Date.now();
        // Reset counter if a minute has passed
        if (now - this.jupiterCallResetTime > 60000) {
            this.jupiterCallCount = 0;
            this.jupiterCallResetTime = now;
            return true;
        }
        // Check if we're over the limit
        if (this.jupiterCallCount >= this.MAX_JUPITER_CALLS_PER_MINUTE) {
            logger_1.default.warn(`[RateLimit] Jupiter API call limit reached (${this.MAX_JUPITER_CALLS_PER_MINUTE}/min). Throttling.`);
            return false;
        }
        // Increment counter and allow the call
        this.jupiterCallCount++;
        return true;
    }
    async pollWatchedTokens() {
        // Emit heartbeat for PriceWatcher
        if (globalThis.heartbeat?.PriceWatcher) {
            globalThis.heartbeat.PriceWatcher();
        }
        else {
            logger_1.default.debug('[HEARTBEAT] PriceWatcher heartbeat function not found');
        }
        if (this.watchedTokens.size === 0) {
            return; // Nothing to poll
        }
        // Check if we're approaching rate limits and adjust polling behavior
        const rpcUtilization = this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE;
        const jupiterUtilization = this.jupiterCallCount / this.MAX_JUPITER_CALLS_PER_MINUTE;
        if (rpcUtilization > 0.8 || jupiterUtilization > 0.8) {
            logger_1.default.warn(`[RateLimit] High API utilization - RPC: ${(rpcUtilization * 100).toFixed(0)}%, Jupiter: ${(jupiterUtilization * 100).toFixed(0)}%. Reducing polling.`);
            // Only poll a subset of tokens when approaching limits
            const keysToProcess = Array.from(this.watchedTokens.keys()).slice(0, 5); // Process max 5 tokens
            const pollPromises = keysToProcess.map(mint => this.pollSingleToken(mint));
            await Promise.allSettled(pollPromises);
            return;
        }
        // Normal polling when not rate limited
        logger_1.default.debug(`[PriceWatcher] Polling ${this.watchedTokens.size} tokens. RPC calls: ${this.rpcCallCount}/${this.MAX_RPC_CALLS_PER_MINUTE}, Jupiter: ${this.jupiterCallCount}/${this.MAX_JUPITER_CALLS_PER_MINUTE}`);
        const pollPromises = Array.from(this.watchedTokens.keys()).map(mint => this.pollSingleToken(mint));
        const results = await Promise.allSettled(pollPromises);
        // Log errors
        results.forEach(async (result, index) => {
            if (result.status === 'rejected') {
                const mint = Array.from(this.watchedTokens.keys())[index];
                logger_1.default.warn(`[PriceWatcher] Polling promise rejected for ${mint}: ${result.reason}`);
                tradeLogger_1.tradeLogger.logScenario('PRICE_WATCHER_ERROR', {
                    event: 'pollWatchedTokens',
                    token: mint,
                    error: result.reason?.message || String(result.reason),
                    timestamp: new Date().toISOString()
                });
                await (0, notifications_1.sendAlert)(`[PriceWatcher] Polling promise rejected for ${mint}: ${result.reason}`, 'CRITICAL');
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
                pairAddress: tokenData.pairAddress ?? undefined,
                decimals: tokenData.decimals ?? 0,
                currentPrice: currentPrice ?? 0,
                priceChangePercent: priceChangePercent ?? undefined,
                priceChange1m: priceChange1m ?? undefined,
                volume5m: pairData?.volume?.m5 ?? undefined,
                volumeChangePercent: volumeChangePercent ?? undefined,
                liquidity: tokenData.liquidity ?? 0,
                buyRatio5m: buyRatio5m ?? undefined,
                pairCreatedAt: pairData?.pairCreatedAt ?? undefined,
                signalReason: undefined,
                symbol: undefined,
                volume1h: pairData?.volume?.h1 ?? undefined
            };
            // Reset error count on success
            tokenData.errorCount = 0;
            tokenData.lastCheckTimestamp = Date.now();
        }
        catch (error) {
            logger_1.default.error(`[PriceWatcher] Error polling token ${mintAddress}: ${error.message}`);
            tradeLogger_1.tradeLogger.logScenario('PRICE_WATCHER_ERROR', {
                event: 'pollSingleToken',
                token: mintAddress,
                error: error?.message || String(error),
                timestamp: new Date().toISOString()
            });
            await (0, notifications_1.sendAlert)(`[PriceWatcher] Error polling token ${mintAddress}: ${error.message}`, 'CRITICAL');
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
    // Updated Jupiter price fetching function with rate limiting
    async fetchJupiterPrice(inputMint, outputMint, inputDecimals) {
        // Check Jupiter rate limit before making API call
        if (!this.checkJupiterRateLimit()) {
            logger_1.default.warn(`[PriceWatcher] Jupiter rate limit reached for ${inputMint}, using cached price if available`);
            // Try to use cached price if available
            const tokenData = this.watchedTokens.get(inputMint);
            if (tokenData?.lastPrice) {
                return tokenData.lastPrice;
            }
            // Otherwise throw error to be handled by caller
            throw new Error('Jupiter rate limit reached and no cached price available');
        }
        // Get decimals for the output token (quote currency)
        const outputDecimals = await this.getTokenDecimals(outputMint);
        // Calculate amount for 1 whole unit of the input token in its smallest unit
        const amountInLamports = BigInt(1 * (10 ** inputDecimals));
        try {
            const quoteResponse = await this.jupiterApi.quoteGet({
                inputMint: inputMint,
                outputMint: outputMint,
                amount: amountInLamports.toString(), // Force type to resolve TS error
                onlyDirectRoutes: true, // Use direct routes to reduce API complexity
                slippageBps: 50
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
            logger_1.default.error(`[PriceWatcher] Jupiter quote failed for ${inputMint} -> ${outputMint}: ${errorMessage}`);
            await (0, notifications_1.sendAlert)(`[PriceWatcher] Jupiter quote failed for ${inputMint} -> ${outputMint}: ${errorMessage}`, 'ERROR');
            // Try to use cached price if available
            const tokenData = this.watchedTokens.get(inputMint);
            if (tokenData?.lastPrice) {
                logger_1.default.info(`[PriceWatcher] Using cached price ${tokenData.lastPrice} for ${inputMint} due to Jupiter error`);
                return tokenData.lastPrice;
            }
            throw new Error(`Jupiter quote failed: ${errorMessage}`);
        }
    }
    // Fetches Dexscreener data for a pool (pair) or token using axios
    async fetchDexscreenerData(queryAddress, type) {
        let url;
        if (type === 'pair') {
            url = `https://api.dexscreener.com/latest/dex/pairs/solana/${queryAddress}`;
        }
        else {
            url = `https://api.dexscreener.com/latest/dex/tokens/solana/${queryAddress}`;
        }
        logger_1.default.debug(`[PriceWatcher] Fetching Dexscreener data: ${url}`);
        try {
            const response = await axios_1.default.get(url, { timeout: 10000, headers: { 'Accept': 'application/json' } });
            if (response.status !== 200) {
                logger_1.default.warn(`[PriceWatcher] Dexscreener API returned non-200 status: ${response.status} for ${url}`);
                return null;
            }
            if (!response.data || !response.data.pairs) {
                logger_1.default.warn(`[PriceWatcher] Dexscreener API returned no pairs data for ${url}`);
                return null;
            }
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
                    targetPair = pairs[0];
                    logger_1.default.debug(`[PriceWatcher] No primary quote pair (USDC/SOL) found via token search for ${queryAddress}, using most liquid: ${targetPair?.pairAddress}`);
                }
                else {
                    logger_1.default.debug(`[PriceWatcher] Found target pair ${targetPair.pairAddress} via token search for ${queryAddress}`);
                }
            }
            else {
                targetPair = pairs[0];
            }
            if (!targetPair) {
                logger_1.default.warn(`[PriceWatcher] Could not determine target pair from Dexscreener response for ${url}`);
                return null;
            }
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