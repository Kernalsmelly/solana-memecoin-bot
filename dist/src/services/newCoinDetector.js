import { EventEmitter } from 'events';
import { PublicKey, } from '@solana/web3.js'; // Ensure PublicKey & ParsedAccountData are imported
import logger from '../utils/logger.js';
import bs58 from 'bs58'; // Try default import again, but access .decode property
import { createJupiterApiClient } from '@jup-ag/api'; // Import Jupiter API client
import { appendPoolDetectionLog } from '../utils/poolDetectionLogger.js';
import axios from 'axios';
import { sleep } from '../utils/helpers.js';
import { globalRateLimiter } from '../launch.js';
// Constants
const RAYDIUM_LP_V4_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Mainnet USDC
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'; // Mainnet USDT (SPL)
// Add other accepted quote mints if needed
// DEBUG: Log every new pool/signature discovery and emission
function debugLogPoolDiscovery(context, data) {
    logger.info(`[DEBUG] [NewCoinDetector] ${context}`, data);
}
// Actual discriminator for Raydium LP V4 initialize2 instruction
// SHA256("global:initialize2").slice(0, 8)
const INITIALIZE2_DISCRIMINATOR = Buffer.from([0xf1, 0x4b, 0x4f, 0x4a, 0x30, 0xa4, 0x20, 0xec]);
// --- Type Guards ---
// Type guard to check if an instruction is a ParsedInstruction or PartiallyDecodedInstruction
// containing valid Initialize2Info in its parsed data.
function isParsedInstructionWithInitializeInfo(instruction) {
    return (instruction &&
        typeof instruction === 'object' &&
        'parsed' in instruction && // Check if 'parsed' property exists
        instruction.parsed &&
        typeof instruction.parsed === 'object' &&
        'info' in instruction.parsed && // Check if 'info' property exists within 'parsed'
        instruction.parsed.info &&
        typeof instruction.parsed.info === 'object' &&
        // Check for the specific required properties of Initialize2Info
        'amm' in instruction.parsed.info &&
        typeof instruction.parsed.info.amm === 'string' &&
        'mintA' in instruction.parsed.info &&
        typeof instruction.parsed.info.mintA === 'string' &&
        'mintB' in instruction.parsed.info &&
        typeof instruction.parsed.info.mintB === 'string'
    // Add checks for type like 'initialize2' if needed for more specificity,
    // but structure check might be sufficient here.
    // && (instruction.parsed.type === 'initialize2' || instruction.parsed.instructionType === 'initialize2')
    );
}
// Type guard to check if account info represents a valid SPL Mint account with decimals
function isMintAccountInfoWithDecimals(accountInfo) {
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
export class NewCoinDetector extends EventEmitter {
    connection;
    config;
    jupiterApi;
    processedSignatures = new Set();
    pollingActive = false; // Flag to control polling loop
    pollIntervalId = null; // Stores the timeout ID
    pollingIntervalMs; // Stores the interval duration
    isPolling = false; // Flag for active poll execution
    lastProcessedSignatureForPolling = ''; // Marker for the next poll, now always a string
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
        this.jupiterApi = createJupiterApiClient(); // Initialize Jupiter API client
        logger.info('NewCoinDetector initialized.');
        logger.info(`Using RPC endpoint: ${connection.rpcEndpoint}`);
        logger.info(`[NewCoinDetector] Configured WSS endpoint: ${this.config.solana.wssEndpoint}`);
        // Set up a timer to reset the processed pools periodically to prevent memory leaks
        setInterval(() => {
            const oldSize = this.processedPools.size;
            if (oldSize > this.MAX_PROCESSED_POOLS / 2) {
                // Convert to array, keep only the most recent half, and convert back to Set
                const poolsArray = Array.from(this.processedPools);
                const newPoolsArray = poolsArray.slice(poolsArray.length / 2);
                this.processedPools = new Set(newPoolsArray);
                logger.debug(`[NewCoinDetector] Cleaned processed pools cache from ${oldSize} to ${this.processedPools.size} entries`);
            }
        }, 30 * 60 * 1000); // Clean every 30 minutes
    }
    start() {
        if (process.env.STRESS_TEST_MODE === 'true') {
            logger.warn('[STRESS TEST] Emitting 50 fake new pool events for stress test!');
            for (let i = 0; i < 50; i++) {
                const event = {
                    poolAddress: `FakePool${i}`,
                    baseMint: 'So11111111111111111111111111111111111111112',
                    quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                    lpMint: '',
                    market: '',
                    signature: `FakeSig${i}`,
                    timestamp: Date.now(),
                };
                logger.info(`[STRESS TEST] Emitting fake pool event #${i + 1}`, event);
                this.emit('newPoolDetected', event);
            }
        }
        if (this.pollIntervalId) {
            logger.warn('NewCoinDetector polling already active.');
            return;
        }
        logger.info('Starting NewCoinDetector polling with enhanced rate limiting...');
        // Poll every 2 minutes to further reduce RPC calls
        const pollInterval = 2 * 60 * 1000; // 2 minutes instead of 1 minute
        logger.info(`[NewCoinDetector] Using poll interval of ${pollInterval / 1000} seconds with max ${this.MAX_RPC_CALLS_PER_MINUTE} RPC calls/min`);
        logger.info(`[NewCoinDetector] Processing max ${this.MAX_POOLS_TO_PROCESS} pools per cycle with ${this.DELAY_BETWEEN_POOLS_MS}ms delay between pools`);
        this.pollIntervalId = setInterval(() => {
            // Check if we're approaching rate limits and potentially skip this cycle
            const rpcUtilization = this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE;
            const globalUtilization = globalRateLimiter.getUtilizationPercent() / 100;
            if (rpcUtilization > 0.8 || globalUtilization > 0.8) {
                logger.warn(`[RateLimit] Skipping NewCoinDetector poll cycle due to high API utilization - Local: ${(rpcUtilization * 100).toFixed(0)}%, Global: ${(globalUtilization * 100).toFixed(0)}%`);
                return;
            }
            this.pollForNewPools().catch((error) => {
                logger.error(`Error in NewCoinDetector polling: ${error.message}`);
            });
        }, pollInterval);
        // Initial poll with a delay to allow other systems to initialize first
        setTimeout(() => {
            this.pollForNewPools().catch((error) => {
                logger.error(`Error in initial NewCoinDetector polling: ${error.message}`);
            });
        }, 10000); // 10 second delay before first poll
    }
    stop() {
        logger.info('Stopping NewCoinDetector...');
        this.pollingActive = false; // Clear flag
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
            logger.debug('[Polling] Cleared scheduled poll timeout.');
        }
    }
    async fetchOnChainPools() {
        const sizes = [624, 680];
        let accounts = [];
        for (const size of sizes) {
            try {
                const accs = await this.connection.getProgramAccounts(RAYDIUM_LP_V4_PROGRAM_ID, {
                    filters: [{ dataSize: size }],
                });
                logger.info(`[Polling] On-chain fetched ${accs.length} accounts size ${size}.`);
                accounts = accounts.concat(accs);
            }
            catch (err) {
                logger.warn(`[Polling] On-chain fetch error size=${size}:`, err);
            }
        }
        // Deduplicate
        const seen = new Set();
        const unique = accounts.filter((acc) => {
            const key = acc.pubkey.toBase58();
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        logger.info(`[Polling] On-chain unique accounts: ${unique.length}`);
        // Parse to poolData
        return unique.map((acc) => {
            const buf = acc.account.data;
            let lpMint = '', baseMint = '', quoteMint = '', market = '';
            try {
                lpMint = new PublicKey(buf.slice(40, 72)).toBase58();
                baseMint = new PublicKey(buf.slice(72, 104)).toBase58();
                quoteMint = new PublicKey(buf.slice(104, 136)).toBase58();
                market = new PublicKey(buf.slice(136, 168)).toBase58();
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
        // PILOT PATCH: Return static mock pool data, never call axios
        return [
            { id: 'MOCK_POOL_1', symbol: 'MOCK1', liquidity: 100000 },
            { id: 'MOCK_POOL_2', symbol: 'MOCK2', liquidity: 90000 },
        ];
        try {
            const raydiumUrl = 'https://api.raydium.io/v2/sdk/liquidity/mainnet.json';
            const response = await axios.get(raydiumUrl, { timeout: 5000 });
            const poolData = response.data?.official || response.data || [];
            logger.info(`[Raydium API] Successfully fetched ${poolData.length} pools`);
            return poolData;
        }
        catch (error) {
            logger.warn(`[Raydium API] Failed to fetch pools: ${error.message}`);
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
                logger.debug(`[ProcessPool] Invalid pool data: ${JSON.stringify(pool)}`);
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
                timestamp: Date.now(),
            };
            this.emit('newPoolDetected', event);
            logger.info(`[ProcessPool] New pool detected: ${pool.ammId} (${pool.baseMint})`);
        }
        catch (error) {
            logger.error(`[ProcessPool] Error processing pool ${pool?.ammId}: ${error.message}`);
        }
    }
    /**
     * Poll for new pools using on-chain data as fallback
     */
    async pollOnChain() {
        // Check rate limit before making expensive RPC calls
        if (!this.checkRpcRateLimit()) {
            logger.warn(`[OnChain] Skipping on-chain polling due to rate limiting`);
            return;
        }
        logger.info(`[OnChain] Falling back to on-chain polling for new pools`);
        try {
            const pools = await this.fetchOnChainPools();
            if (pools.length > 0) {
                logger.info(`[OnChain] Found ${pools.length} pools, processing max ${this.MAX_POOLS_TO_PROCESS}`);
                // Process only a limited number of pools
                const poolsToProcess = pools.slice(0, this.MAX_POOLS_TO_PROCESS);
                for (const pool of poolsToProcess) {
                    // Skip if already processed
                    if (this.processedPools.has(pool.ammId)) {
                        continue;
                    }
                    await this.processRaydiumPool(pool);
                    this.processedPools.add(pool.ammId);
                    await sleep(this.DELAY_BETWEEN_POOLS_MS);
                }
            }
        }
        catch (error) {
            logger.error(`[OnChain] Error in on-chain polling: ${error.message}`);
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
            logger.warn(`[RateLimit] NewCoinDetector local RPC call limit reached (${this.MAX_RPC_CALLS_PER_MINUTE}/min). Throttling.`);
            return false;
        }
        // Also check the global rate limiter
        if (!globalRateLimiter.checkLimit()) {
            logger.warn(`[RateLimit] Global RPC call limit reached. NewCoinDetector throttling.`);
            return false;
        }
        // Increment local counter and allow the call
        this.rpcCallCount++;
        return true;
    }
    async pollForNewPools() {
        if (this.isPolling) {
            logger.debug('[Polling] Poll already in progress, skipping.');
            return;
        }
        this.isPolling = true;
        // Log current rate limit status
        const localUtilization = (this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE) * 100;
        const globalUtilization = globalRateLimiter.getUtilizationPercent();
        logger.info(`[Polling] Starting Raydium pool poll... RPC utilization: Local ${localUtilization.toFixed(0)}%, Global ${globalUtilization}%`);
        try {
            // First, try to get new pools from Raydium API (HTTP request, not RPC call)
            const raydiumPools = await this.fetchRaydiumPools();
            if (raydiumPools && raydiumPools.length > 0) {
                logger.info(`[Polling] Found ${raydiumPools.length} pools from Raydium API, processing max ${this.MAX_POOLS_TO_PROCESS}`);
                // Process only a limited number of pools per cycle to avoid rate limits
                const poolsToProcess = raydiumPools.slice(0, this.MAX_POOLS_TO_PROCESS);
                let processedCount = 0;
                for (const pool of poolsToProcess) {
                    // Check rate limit before processing each pool
                    if (!this.checkRpcRateLimit()) {
                        logger.warn(`[RateLimit] Pausing pool processing due to rate limiting. Processed ${processedCount} of ${poolsToProcess.length} pools.`);
                        break;
                    }
                    // Skip if we've already processed this pool
                    if (this.processedPools.has(pool.id)) {
                        logger.debug(`[Polling] Pool ${pool.id} already processed, skipping.`);
                        continue;
                    }
                    // Process the pool
                    await this.processRaydiumPool(pool);
                    processedCount++;
                    // Add to processed set
                    this.processedPools.add(pool.id);
                    // Add delay between processing pools to avoid rate limits
                    await sleep(this.DELAY_BETWEEN_POOLS_MS);
                }
                logger.info(`[Polling] Completed processing ${processedCount} new pools.`);
            }
            else {
                logger.info('[Polling] No new pools found from Raydium API, falling back to on-chain polling.');
                // Check if we should proceed with on-chain polling based on rate limits
                if (localUtilization > 70 || globalUtilization > 70) {
                    logger.warn(`[RateLimit] Skipping on-chain polling due to high API utilization.`);
                }
                else {
                    // Fall back to on-chain polling if API doesn't return results
                    await this.pollOnChain();
                }
            }
        }
        catch (error) {
            logger.error(`[Polling] Error polling for new pools: ${error.message}`);
        }
        finally {
            this.isPolling = false;
            // Log final rate limit status
            const finalLocalUtilization = (this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE) * 100;
            const finalGlobalUtilization = globalRateLimiter.getUtilizationPercent();
            logger.debug(`[Polling] Completed poll cycle. RPC utilization: Local ${finalLocalUtilization.toFixed(0)}%, Global ${finalGlobalUtilization}%`);
        }
    }
    async processSignature(signature) {
        // Skip if already processed
        if (this.processedPools.has(signature)) {
            logger.debug(`[NewCoinDetector] Signature already processed, skipping: ${signature}`);
            return;
        }
        this.processedPools.add(signature);
        // Respect rate limits
        if (!this.checkRpcRateLimit()) {
            logger.warn(`[RateLimit] Skipping signature processing due to rate limiting: ${signature}`);
            return;
        }
        try {
            const tx = await this.connection.getParsedTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
            });
            if (!tx || !tx.transaction) {
                logger.warn(`Invalid transaction data for signature: ${signature}`);
                return;
            }
            // Attempt to locate the initialize2 instruction within the transaction
            const ix = tx.transaction.message.instructions.find((i) => {
                if ('data' in i && 'programId' in i) {
                    try {
                        const programId = i.programId;
                        const dataBuf = Buffer.from(bs58.decode(i.data));
                        return (programId.equals(RAYDIUM_LP_V4_PROGRAM_ID) &&
                            Buffer.compare(dataBuf.slice(0, 8), INITIALIZE2_DISCRIMINATOR) === 0);
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
            const data = Buffer.from(bs58.decode(ix.data));
            const baseMint = new PublicKey(data.slice(72, 104)).toBase58();
            const quoteMint = new PublicKey(data.slice(104, 136)).toBase58();
            const accountKeys = tx.transaction.message.accountKeys;
            const accountKey = accountKeys ? accountKeys[ix.accounts[0]] : null;
            const poolAddress = accountKey?.pubkey
                ? accountKey.pubkey.toBase58()
                : accountKey?.toBase58?.() || '';
            const event = {
                poolAddress,
                baseMint,
                quoteMint,
                lpMint: '',
                market: '',
                signature,
                timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
            };
            debugLogPoolDiscovery('Emitting newPoolDetected', event);
            this.emit('newPoolDetected', event);
            appendPoolDetectionLog(event);
        }
        catch (error) {
            logger.error(`[processSignature] Failed to process signature ${signature}: ${error.message}`);
        }
    }
}
//# sourceMappingURL=newCoinDetector.js.map