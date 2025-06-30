"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewCoinDetector = void 0;
const events_1 = require("events");
const web3_js_1 = require("@solana/web3.js"); // Ensure PublicKey & ParsedAccountData are imported
const logger_1 = __importDefault(require("../utils/logger"));
const bs58_1 = __importDefault(require("bs58")); // Try default import again, but access .decode property
const api_1 = require("@jup-ag/api"); // Import Jupiter API client
const poolDetectionLogger_1 = require("../utils/poolDetectionLogger");
const axios_1 = __importDefault(require("axios"));
const helpers_1 = require("../utils/helpers");
const launch_1 = require("../launch");
// Constants
const RAYDIUM_LP_V4_PROGRAM_ID = new web3_js_1.PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Mainnet USDC
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"; // Mainnet USDT (SPL)
// Add other accepted quote mints if needed
// DEBUG: Log every new pool/signature discovery and emission
function debugLogPoolDiscovery(context, data) {
    logger_1.default.info(`[DEBUG] [NewCoinDetector] ${context}`, data);
}
// Actual discriminator for Raydium LP V4 initialize2 instruction
// SHA256("global:initialize2").slice(0, 8)
const INITIALIZE2_DISCRIMINATOR = Buffer.from([0xf1, 0x4b, 0x4f, 0x4a, 0x30, 0xa4, 0x20, 0xec]);
// --- Type Guards ---
// Type guard to check if an instruction is a ParsedInstruction or PartiallyDecodedInstruction
// containing valid Initialize2Info in its parsed data.
function isParsedInstructionWithInitializeInfo(instruction // Start with any as input comes from array iteration
) {
    return (instruction &&
        typeof instruction === 'object' &&
        'parsed' in instruction && // Check if 'parsed' property exists
        instruction.parsed &&
        typeof instruction.parsed === 'object' &&
        'info' in instruction.parsed && // Check if 'info' property exists within 'parsed'
        instruction.parsed.info &&
        typeof instruction.parsed.info === 'object' &&
        // Check for the specific required properties of Initialize2Info
        'amm' in instruction.parsed.info && typeof instruction.parsed.info.amm === 'string' &&
        'mintA' in instruction.parsed.info && typeof instruction.parsed.info.mintA === 'string' &&
        'mintB' in instruction.parsed.info && typeof instruction.parsed.info.mintB === 'string'
    // Add checks for type like 'initialize2' if needed for more specificity, 
    // but structure check might be sufficient here.
    // && (instruction.parsed.type === 'initialize2' || instruction.parsed.instructionType === 'initialize2') 
    );
}
// Type guard to check if account info represents a valid SPL Mint account with decimals
function isMintAccountInfoWithDecimals(accountInfo // Start with any as input comes from RPC call result
) {
    return (accountInfo &&
        typeof accountInfo === 'object' &&
        accountInfo.value &&
        typeof accountInfo.value === 'object' &&
        accountInfo.value.data &&
        typeof accountInfo.value.data === 'object' &&
        accountInfo.value.data.program === 'spl_token' && // Check program
        accountInfo.value.data.parsed &&
        typeof accountInfo.value.data.parsed === 'object' &&
        accountInfo.value.data.parsed.type === 'mint' && // Check type
        accountInfo.value.data.parsed.info &&
        typeof accountInfo.value.data.parsed.info === 'object' &&
        'decimals' in accountInfo.value.data.parsed.info && // Check decimals property
        typeof accountInfo.value.data.parsed.info.decimals === 'number' // Check decimals type
    );
}
class NewCoinDetector extends events_1.EventEmitter {
    connection;
    config;
    jupiterApi;
    processedSignatures = new Set();
    pollingActive = false; // Flag to control polling loop
    pollIntervalId = null; // Stores the timeout ID
    pollingIntervalMs; // Stores the interval duration
    isPolling = false; // Flag for active poll execution
    lastProcessedSignatureForPolling = ""; // Marker for the next poll, now always a string
    // Rate limiting properties
    rpcCallCount = 0;
    rpcCallResetTime = Date.now();
    MAX_RPC_CALLS_PER_MINUTE = 50; // Reduced from 60 to 50 to be more conservative
    // Process tracking
    processedPools = new Set();
    MAX_PROCESSED_POOLS = 1000; // Limit memory usage
    MAX_POOLS_TO_PROCESS = 5; // Process max 5 pools per cycle
    DELAY_BETWEEN_POOLS_MS = 1000; // 1 second delay between processing pools
    constructor(connection, config) {
        super();
        this.connection = connection;
        this.config = config;
        this.pollingIntervalMs = config.tokenMonitor.pollingIntervalSeconds * 1000; // Initialize interval duration
        this.jupiterApi = (0, api_1.createJupiterApiClient)(); // Initialize Jupiter API client
        logger_1.default.info("NewCoinDetector initialized.");
        logger_1.default.info(`Using RPC endpoint: ${connection.rpcEndpoint}`);
        logger_1.default.info(`[NewCoinDetector] Configured WSS endpoint: ${this.config.solana.wssEndpoint}`);
        // Set up a timer to reset the processed pools periodically to prevent memory leaks
        setInterval(() => {
            const oldSize = this.processedPools.size;
            if (oldSize > this.MAX_PROCESSED_POOLS / 2) {
                // Convert to array, keep only the most recent half, and convert back to Set
                const poolsArray = Array.from(this.processedPools);
                const newPoolsArray = poolsArray.slice(poolsArray.length / 2);
                this.processedPools = new Set(newPoolsArray);
                logger_1.default.debug(`[NewCoinDetector] Cleaned processed pools cache from ${oldSize} to ${this.processedPools.size} entries`);
            }
        }, 30 * 60 * 1000); // Clean every 30 minutes
    }
    start() {
        if (this.pollIntervalId) {
            logger_1.default.warn('NewCoinDetector polling already active.');
            return;
        }
        logger_1.default.info('Starting NewCoinDetector polling with enhanced rate limiting...');
        // Poll every 2 minutes to further reduce RPC calls
        const pollInterval = 2 * 60 * 1000; // 2 minutes instead of 1 minute
        logger_1.default.info(`[NewCoinDetector] Using poll interval of ${pollInterval / 1000} seconds with max ${this.MAX_RPC_CALLS_PER_MINUTE} RPC calls/min`);
        logger_1.default.info(`[NewCoinDetector] Processing max ${this.MAX_POOLS_TO_PROCESS} pools per cycle with ${this.DELAY_BETWEEN_POOLS_MS}ms delay between pools`);
        this.pollIntervalId = setInterval(() => {
            // Check if we're approaching rate limits and potentially skip this cycle
            const rpcUtilization = this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE;
            const globalUtilization = launch_1.globalRateLimiter.getUtilizationPercent() / 100;
            if (rpcUtilization > 0.8 || globalUtilization > 0.8) {
                logger_1.default.warn(`[RateLimit] Skipping NewCoinDetector poll cycle due to high API utilization - Local: ${(rpcUtilization * 100).toFixed(0)}%, Global: ${(globalUtilization * 100).toFixed(0)}%`);
                return;
            }
            this.pollForNewPools().catch(error => {
                logger_1.default.error(`Error in NewCoinDetector polling: ${error.message}`);
            });
        }, pollInterval);
        // Initial poll with a delay to allow other systems to initialize first
        setTimeout(() => {
            this.pollForNewPools().catch(error => {
                logger_1.default.error(`Error in initial NewCoinDetector polling: ${error.message}`);
            });
        }, 10000); // 10 second delay before first poll
    }
    stop() {
        logger_1.default.info('Stopping NewCoinDetector...');
        this.pollingActive = false; // Clear flag
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
            logger_1.default.debug('[Polling] Cleared scheduled poll timeout.');
        }
    }
    async fetchOnChainPools() {
        const sizes = [624, 680];
        let accounts = [];
        for (const size of sizes) {
            try {
                const accs = await this.connection.getProgramAccounts(RAYDIUM_LP_V4_PROGRAM_ID, { filters: [{ dataSize: size }] });
                logger_1.default.info(`[Polling] On-chain fetched ${accs.length} accounts size ${size}.`);
                accounts = accounts.concat(accs);
            }
            catch (err) {
                logger_1.default.warn(`[Polling] On-chain fetch error size=${size}:`, err);
            }
        }
        // Deduplicate
        const seen = new Set();
        const unique = accounts.filter(acc => {
            const key = acc.pubkey.toBase58();
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        logger_1.default.info(`[Polling] On-chain unique accounts: ${unique.length}`);
        // Parse to poolData
        return unique.map(acc => {
            const buf = acc.account.data;
            let lpMint = '', baseMint = '', quoteMint = '', market = '';
            try {
                lpMint = new web3_js_1.PublicKey(buf.slice(40, 72)).toBase58();
                baseMint = new web3_js_1.PublicKey(buf.slice(72, 104)).toBase58();
                quoteMint = new web3_js_1.PublicKey(buf.slice(104, 136)).toBase58();
                market = new web3_js_1.PublicKey(buf.slice(136, 168)).toBase58();
            }
            catch { }
            return { ammId: acc.pubkey.toBase58(), baseMint, quoteMint, lpMint, market };
        });
    }
    /**
     * Fetch pools from Raydium API (HTTP request, not RPC call)
     * @returns Array of pool data or empty array if failed
     */
    async fetchRaydiumPools() {
        try {
            const raydiumUrl = 'https://api.raydium.io/v2/sdk/liquidity/mainnet.json';
            const response = await axios_1.default.get(raydiumUrl, { timeout: 5000 });
            const poolData = response.data?.official || response.data || [];
            logger_1.default.info(`[Raydium API] Successfully fetched ${poolData.length} pools`);
            return poolData;
        }
        catch (error) {
            logger_1.default.warn(`[Raydium API] Failed to fetch pools: ${error.message}`);
            return [];
        }
    }
    /**
     * Process a Raydium pool and emit event if it's a valid new pool
     * @param pool The pool data from Raydium API
     */
    async processRaydiumPool(pool) {
        try {
            // Basic validation
            if (!pool.ammId || !pool.baseMint || !pool.quoteMint) {
                logger_1.default.debug(`[ProcessPool] Invalid pool data: ${JSON.stringify(pool)}`);
                return;
            }
            // Emit the new pool detected event
            const event = {
                poolAddress: pool.ammId,
                baseMint: pool.baseMint,
                quoteMint: pool.quoteMint,
                lpMint: pool.lpMint || '',
                market: pool.market || '',
                signature: '',
                timestamp: Date.now()
            };
            this.emit('newPoolDetected', event);
            logger_1.default.info(`[ProcessPool] New pool detected: ${pool.ammId} (${pool.baseMint})`);
        }
        catch (error) {
            logger_1.default.error(`[ProcessPool] Error processing pool ${pool?.ammId}: ${error.message}`);
        }
    }
    /**
     * Poll for new pools using on-chain data as fallback
     */
    async pollOnChain() {
        // Check rate limit before making expensive RPC calls
        if (!this.checkRpcRateLimit()) {
            logger_1.default.warn(`[OnChain] Skipping on-chain polling due to rate limiting`);
            return;
        }
        logger_1.default.info(`[OnChain] Falling back to on-chain polling for new pools`);
        try {
            const pools = await this.fetchOnChainPools();
            if (pools.length > 0) {
                logger_1.default.info(`[OnChain] Found ${pools.length} pools, processing max ${this.MAX_POOLS_TO_PROCESS}`);
                // Process only a limited number of pools
                const poolsToProcess = pools.slice(0, this.MAX_POOLS_TO_PROCESS);
                for (const pool of poolsToProcess) {
                    // Skip if already processed
                    if (this.processedPools.has(pool.ammId)) {
                        continue;
                    }
                    await this.processRaydiumPool(pool);
                    this.processedPools.add(pool.ammId);
                    await (0, helpers_1.sleep)(this.DELAY_BETWEEN_POOLS_MS);
                }
            }
        }
        catch (error) {
            logger_1.default.error(`[OnChain] Error in on-chain polling: ${error.message}`);
        }
    }
    /**
     * Rate limiter for RPC calls to prevent excessive QuickNode usage
     * Uses both local and global rate limiters for better control
     * @returns true if the call is allowed, false if it should be throttled
     */
    checkRpcRateLimit() {
        const now = Date.now();
        // Reset counter if a minute has passed
        if (now - this.rpcCallResetTime > 60000) {
            this.rpcCallCount = 0;
            this.rpcCallResetTime = now;
        }
        // Check if we're over the local limit
        if (this.rpcCallCount >= this.MAX_RPC_CALLS_PER_MINUTE) {
            logger_1.default.warn(`[RateLimit] NewCoinDetector local RPC call limit reached (${this.MAX_RPC_CALLS_PER_MINUTE}/min). Throttling.`);
            return false;
        }
        // Also check the global rate limiter
        if (!launch_1.globalRateLimiter.checkLimit()) {
            logger_1.default.warn(`[RateLimit] Global RPC call limit reached. NewCoinDetector throttling.`);
            return false;
        }
        // Increment local counter and allow the call
        this.rpcCallCount++;
        return true;
    }
    async pollForNewPools() {
        if (this.isPolling) {
            logger_1.default.debug('[Polling] Poll already in progress, skipping.');
            return;
        }
        this.isPolling = true;
        // Log current rate limit status
        const localUtilization = (this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE) * 100;
        const globalUtilization = launch_1.globalRateLimiter.getUtilizationPercent();
        logger_1.default.info(`[Polling] Starting Raydium pool poll... RPC utilization: Local ${localUtilization.toFixed(0)}%, Global ${globalUtilization}%`);
        try {
            // First, try to get new pools from Raydium API (HTTP request, not RPC call)
            const raydiumPools = await this.fetchRaydiumPools();
            if (raydiumPools && raydiumPools.length > 0) {
                logger_1.default.info(`[Polling] Found ${raydiumPools.length} pools from Raydium API, processing max ${this.MAX_POOLS_TO_PROCESS}`);
                // Process only a limited number of pools per cycle to avoid rate limits
                const poolsToProcess = raydiumPools.slice(0, this.MAX_POOLS_TO_PROCESS);
                let processedCount = 0;
                for (const pool of poolsToProcess) {
                    // Check rate limit before processing each pool
                    if (!this.checkRpcRateLimit()) {
                        logger_1.default.warn(`[RateLimit] Pausing pool processing due to rate limiting. Processed ${processedCount} of ${poolsToProcess.length} pools.`);
                        break;
                    }
                    // Skip if we've already processed this pool
                    if (this.processedPools.has(pool.id)) {
                        logger_1.default.debug(`[Polling] Pool ${pool.id} already processed, skipping.`);
                        continue;
                    }
                    // Process the pool
                    await this.processRaydiumPool(pool);
                    processedCount++;
                    // Add to processed set
                    this.processedPools.add(pool.id);
                    // Add delay between processing pools to avoid rate limits
                    await (0, helpers_1.sleep)(this.DELAY_BETWEEN_POOLS_MS);
                }
                logger_1.default.info(`[Polling] Completed processing ${processedCount} new pools.`);
            }
            else {
                logger_1.default.info('[Polling] No new pools found from Raydium API, falling back to on-chain polling.');
                // Check if we should proceed with on-chain polling based on rate limits
                if (localUtilization > 70 || globalUtilization > 70) {
                    logger_1.default.warn(`[RateLimit] Skipping on-chain polling due to high API utilization.`);
                }
                else {
                    // Fall back to on-chain polling if API doesn't return results
                    await this.pollOnChain();
                }
            }
        }
        catch (error) {
            logger_1.default.error(`[Polling] Error polling for new pools: ${error.message}`);
        }
        finally {
            this.isPolling = false;
            // Log final rate limit status
            const finalLocalUtilization = (this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE) * 100;
            const finalGlobalUtilization = launch_1.globalRateLimiter.getUtilizationPercent();
            logger_1.default.debug(`[Polling] Completed poll cycle. RPC utilization: Local ${finalLocalUtilization.toFixed(0)}%, Global ${finalGlobalUtilization}%`);
        }
    }
    async processSignature(signature) {
        // Skip if already processed
        if (this.processedPools.has(signature)) {
            logger_1.default.debug(`[NewCoinDetector] Signature already processed, skipping: ${signature}`);
            return;
        }
        this.processedPools.add(signature);
        // Respect rate limits
        if (!this.checkRpcRateLimit()) {
            logger_1.default.warn(`[RateLimit] Skipping signature processing due to rate limiting: ${signature}`);
            return;
        }
        try {
            const tx = await this.connection.getParsedTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });
            if (!tx || !tx.transaction) {
                logger_1.default.warn(`Invalid transaction data for signature: ${signature}`);
                return;
            }
            // Attempt to locate the initialize2 instruction within the transaction
            const ix = tx.transaction.message.instructions.find(i => {
                if ('data' in i && 'programId' in i) {
                    try {
                        const programId = i.programId;
                        const dataBuf = Buffer.from(bs58_1.default.decode(i.data));
                        return programId.equals(RAYDIUM_LP_V4_PROGRAM_ID) &&
                            Buffer.compare(dataBuf.slice(0, 8), INITIALIZE2_DISCRIMINATOR) === 0;
                    }
                    catch {
                        return false;
                    }
                }
                return false;
            });
            if (!ix) {
                return; // Not a Raydium initialize2 tx
            }
            const data = Buffer.from(bs58_1.default.decode(ix.data));
            const baseMint = new web3_js_1.PublicKey(data.slice(72, 104)).toBase58();
            const quoteMint = new web3_js_1.PublicKey(data.slice(104, 136)).toBase58();
            const accountKeys = tx.transaction.message.accountKeys;
            const accountKey = accountKeys ? accountKeys[ix.accounts[0]] : null;
            const poolAddress = accountKey?.pubkey ? accountKey.pubkey.toBase58() : accountKey?.toBase58?.() || '';
            const event = {
                poolAddress,
                baseMint,
                quoteMint,
                lpMint: '',
                market: '',
                signature,
                timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now()
            };
            debugLogPoolDiscovery('Emitting newPoolDetected', event);
            this.emit('newPoolDetected', event);
            (0, poolDetectionLogger_1.appendPoolDetectionLog)(event);
        }
        catch (error) {
            logger_1.default.error(`[processSignature] Failed to process signature ${signature}: ${error.message}`);
        }
    }
}
exports.NewCoinDetector = NewCoinDetector;
//# sourceMappingURL=newCoinDetector.js.map