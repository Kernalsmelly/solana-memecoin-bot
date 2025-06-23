import { EventEmitter } from 'events';
import { TokenMetrics, PatternDetection, TradingSignal } from '../types';
import { PublicKey, Connection, ParsedAccountData, Logs, Context, ParsedTransactionWithMeta, ConfirmedSignatureInfo } from '@solana/web3.js'; // Ensure PublicKey & ParsedAccountData are imported
import { Config } from '../utils/config';
import logger from '../utils/logger';
import { tradeLogger } from '../utils/tradeLogger';
import { sendAlert } from '../utils/notifications';
import bs58 from 'bs58'; // Try default import again, but access .decode property
import { ParsedInstruction, PartiallyDecodedInstruction } from '@solana/web3.js'; // For type hints
import { createJupiterApiClient } from '@jup-ag/api'; // Import Jupiter API client
import { fetchDexscreenerPoolData } from './dexscreener'; // Dexscreener enrichment
import { appendPoolDetectionLog } from '../utils/poolDetectionLogger';
import axios from 'axios';
import { sleep } from '../utils/helpers';
import { globalRateLimiter } from '../launch';

// Constants
const RAYDIUM_LP_V4_PROGRAM_ID = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // Mainnet USDC
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"; // Mainnet USDT (SPL)
// Add other accepted quote mints if needed

// DEBUG: Log every new pool/signature discovery and emission
function debugLogPoolDiscovery(context: string, data: any) {
  logger.info(`[DEBUG] [NewCoinDetector] ${context}`, data);
}

// Actual discriminator for Raydium LP V4 initialize2 instruction
// SHA256("global:initialize2").slice(0, 8)
const INITIALIZE2_DISCRIMINATOR = Buffer.from([0xf1, 0x4b, 0x4f, 0x4a, 0x30, 0xa4, 0x20, 0xec]);

// Interface for the expected structure of Raydium's initialize2 instruction info
// DEPRECATED - We will extract fields directly
interface Initialize2Info {
    amm: string;       // Pool address (string representation)
    mintA: string;     // Base token mint address
    mintB: string;     // Quote token mint address
    nonce?: number;    // Optional, depending on Raydium version/parsing
    openTime?: number; // Optional
}

// Interface for the necessary info extracted from initialize2
interface Initialize2Params {
    signature: string;
    amm: string;
    lpMint: string;
    coinMint: string;
    pcMint: string;
    serumMarket: string;
    // We can add amounts here later if needed after Borsh decoding
}

// Define the structure for the emitted event data
export interface NewPoolDetectedEvent {
    poolAddress: string;
    baseMint: string;
    quoteMint: string;
    lpMint: string;
    market: string;
    signature: string;
    timestamp: number;
}

// --- Type Guards ---

// Utility: Fetch Raydium pool by baseMint or quoteMint using filtered getProgramAccounts
async function fetchRaydiumPoolsByMint(connection: Connection, mint: string): Promise<any[]> {
    // Raydium pool layout: baseMint at offset 72, quoteMint at offset 104
    const filters = [
        { dataSize: 624 },
        { memcmp: { offset: 72, bytes: mint } }
    ];
    let accounts: any[] = [];
    try {
        accounts = Array.from(
            await connection.getProgramAccounts(
                RAYDIUM_LP_V4_PROGRAM_ID,
                { filters }
            )
        );
    } catch (err: any) {
        logger.warn(`[BirdeyeHybrid] On-chain fetch error for mint ${mint}:`, err);
        return [];
    }
    return accounts.map(acc => {
        const buf: Buffer = acc.account.data;
        let lpMint = '', baseMint = '', quoteMint = '', market = '';
        try {
            lpMint = new PublicKey(buf.slice(40, 72)).toBase58();
            baseMint = new PublicKey(buf.slice(72, 104)).toBase58();
            quoteMint = new PublicKey(buf.slice(104, 136)).toBase58();
            market = new PublicKey(buf.slice(136, 168)).toBase58();
        } catch {}
        return { ammId: acc.pubkey.toBase58(), baseMint, quoteMint, lpMint, market };
    });
}


// Type guard to check if an instruction is a ParsedInstruction or PartiallyDecodedInstruction
// containing valid Initialize2Info in its parsed data.
function isParsedInstructionWithInitializeInfo(
    instruction: any // Start with any as input comes from array iteration
): instruction is ParsedInstruction & { parsed: { type: string | 'initialize2', info: Initialize2Info } } {
    return (
        instruction &&
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
function isMintAccountInfoWithDecimals(
    accountInfo: any // Start with any as input comes from RPC call result
): accountInfo is { value: { data: ParsedAccountData & { parsed: { type: 'mint', info: { decimals: number } } } } } {
    return (
        accountInfo &&
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
    private tokenDiscovery: any | null = null;
    private birdeyeListenerActive = false;

    // Attach TokenDiscovery for Birdeye hybrid mode
    public attachTokenDiscovery(tokenDiscovery: any) {
        this.tokenDiscovery = tokenDiscovery;
        if (!this.birdeyeListenerActive && tokenDiscovery) {
            tokenDiscovery.on('tokenDiscovered', async (token: any) => {
                logger.info(`[BirdeyeHybrid] New token discovered: ${token.address} (${token.symbol})`);
                // Try both baseMint and quoteMint lookups
                let pools: any[] = [];
                pools = await fetchRaydiumPoolsByMint(this.connection, token.address);
                if (pools.length === 0) {
                    pools = await fetchRaydiumPoolsByMint(this.connection, token.baseMint || token.address);
                }
                if (pools.length > 0) {
                    logger.info(`[BirdeyeHybrid] Found ${pools.length} Raydium pools for token ${token.address}`);
                    for (const pool of pools) {
                        await this.processRaydiumPool(pool);
                    }
                } else {
                    logger.info(`[BirdeyeHybrid] No Raydium pools found on-chain for token ${token.address}`);
                }
            });
            this.birdeyeListenerActive = true;
        }
    }

    private connection: Connection;
    private config: Config;
    private jupiterApi: ReturnType<typeof createJupiterApiClient>;
    private processedSignatures: Set<string> = new Set();
    private pollingActive: boolean = false; // Flag to control polling loop
    private pollIntervalId: NodeJS.Timeout | null = null; // Stores the timeout ID
    private pollingIntervalMs: number; // Stores the interval duration
    private isPolling: boolean = false; // Flag for active poll execution
    private lastProcessedSignatureForPolling: string = ""; // Marker for the next poll, now always a string
    
    // Rate limiting properties
    private rpcCallCount: number = 0;
    private rpcCallResetTime: number = Date.now();
    private readonly MAX_RPC_CALLS_PER_MINUTE: number = 50; // Reduced from 60 to 50 to be more conservative
    
    // Process tracking
    private processedPools: Set<string> = new Set();
    private readonly MAX_PROCESSED_POOLS = 1000; // Limit memory usage
    private readonly MAX_POOLS_TO_PROCESS = 5; // Process max 5 pools per cycle
    private readonly DELAY_BETWEEN_POOLS_MS = 1000; // 1 second delay between processing pools

    constructor(connection: Connection, config: Config) {
        super();
        this.connection = connection;
        this.config = config;
        this.pollingIntervalMs = config.tokenMonitor.pollingIntervalSeconds * 1000; // Initialize interval duration
        this.jupiterApi = createJupiterApiClient(); // Initialize Jupiter API client
        logger.info("NewCoinDetector initialized.");
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

    public start(): void {
        if (this.pollIntervalId) {
            logger.warn('NewCoinDetector polling already active.');
            return;
        }

        logger.info('Starting NewCoinDetector polling with enhanced rate limiting...');
        // Poll every 2 minutes to further reduce RPC calls
        const pollInterval = 2 * 60 * 1000; // 2 minutes instead of 1 minute
        
        logger.info(`[NewCoinDetector] Using poll interval of ${pollInterval/1000} seconds with max ${this.MAX_RPC_CALLS_PER_MINUTE} RPC calls/min`);
        logger.info(`[NewCoinDetector] Processing max ${this.MAX_POOLS_TO_PROCESS} pools per cycle with ${this.DELAY_BETWEEN_POOLS_MS}ms delay between pools`);
        
        this.pollIntervalId = setInterval(() => {
            // Check if we're approaching rate limits and potentially skip this cycle
            const rpcUtilization = this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE;
            const globalUtilization = globalRateLimiter.getUtilizationPercent() / 100;
            
            if (rpcUtilization > 0.8 || globalUtilization > 0.8) {
                logger.warn(`[RateLimit] Skipping NewCoinDetector poll cycle due to high API utilization - Local: ${(rpcUtilization*100).toFixed(0)}%, Global: ${(globalUtilization*100).toFixed(0)}%`);
                return;
            }

            
            this.pollForNewPools().catch(error => {
                logger.error(`Error in NewCoinDetector polling: ${error.message}`);
            });
        }, pollInterval);

        // Initial poll with a delay to allow other systems to initialize first
        setTimeout(() => {
            this.pollForNewPools().catch(error => {
                logger.error(`Error in initial NewCoinDetector polling: ${error.message}`);
            });
        }, 10000); // 10 second delay before first poll
    }

    public stop(): void {
        logger.info('Stopping NewCoinDetector...');
        this.pollingActive = false; // Clear flag
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
            logger.debug('[Polling] Cleared scheduled poll timeout.');
        }
    }

    private async fetchOnChainPools(): Promise<any[]> {
        const sizes = [624, 680];
        let accounts: any[] = [];
        for (const size of sizes) {
            try {
                const accs = await this.connection.getProgramAccounts(
                    RAYDIUM_LP_V4_PROGRAM_ID,
                    { filters: [{ dataSize: size }] }
                );
                logger.info(`[Polling] On-chain fetched ${accs.length} accounts size ${size}.`);
                accounts = accounts.concat(accs);
            } catch (err: any) {
                logger.warn(`[Polling] On-chain fetch error size=${size}:`, err);
            }
        }
        // Deduplicate
        const seen = new Set<string>();
        const unique = accounts.filter(acc => {
            const key = acc.pubkey.toBase58();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        logger.info(`[Polling] On-chain unique accounts: ${unique.length}`);
        // Parse to poolData
        return unique.map(acc => {
            const buf: Buffer = acc.account.data;
            let lpMint = '', baseMint = '', quoteMint = '', market = '';
            try {
                lpMint = new PublicKey(buf.slice(40, 72)).toBase58();
                baseMint = new PublicKey(buf.slice(72, 104)).toBase58();
                quoteMint = new PublicKey(buf.slice(104, 136)).toBase58();
                market = new PublicKey(buf.slice(136, 168)).toBase58();
            } catch {}
    return { ammId: acc.pubkey.toBase58(), baseMint, quoteMint, lpMint, market };
        });
    }

    /**
     * Fetch pools from Raydium API (HTTP request, not RPC call)
     * @returns Array of pool data or empty array if failed
     */
    private async fetchRaydiumPools(): Promise<any[]> {
        try {
            const raydiumUrl = 'https://api.raydium.io/v2/sdk/liquidity/mainnet.json';
            const response = await axios.get(raydiumUrl, { timeout: 5000 });
            const poolData = response.data?.official || response.data || [];
            logger.info(`[Raydium API] Successfully fetched ${poolData.length} pools`);
            return poolData;
        } catch (error: any) {
            logger.warn(`[Raydium API] Failed to fetch pools: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Process a Raydium pool and emit event if it's a valid new pool
     * @param pool The pool data from Raydium API
     */
    private async processRaydiumPool(pool: any): Promise<void> {
        try {
            // Basic validation
            if (!pool.ammId || !pool.baseMint || !pool.quoteMint) {
                logger.debug(`[ProcessPool] Invalid pool data: ${JSON.stringify(pool)}`);
                return;
            }
            
            // Emit the new pool detected event
            const event: NewPoolDetectedEvent = {
                poolAddress: pool.ammId,
                baseMint: pool.baseMint,
                quoteMint: pool.quoteMint,
                lpMint: pool.lpMint || '',
                market: pool.market || '',
                signature: '',
                timestamp: Date.now()
            };
            
            this.emit('newPoolDetected', event);
            logger.info(`[ProcessPool] New pool detected: ${pool.ammId} (${pool.baseMint})`);
        } catch (error: any) {
            logger.error(`[ProcessPool] Error processing pool ${pool?.ammId}: ${error.message}`);
    tradeLogger.logScenario('NEW_COIN_DETECTOR_ERROR', {
      event: 'processRaydiumPool',
      pool: pool?.ammId,
      error: error?.message || String(error),
      timestamp: new Date().toISOString()
    });
        await sendAlert(`[NewCoinDetector] Error processing pool ${pool?.ammId}: ${error.message}`, 'CRITICAL');
        }
    }

    /**
     * Poll for new pools using on-chain data as fallback
     */
    private async pollOnChain(): Promise<void> {
        // Emit heartbeat for NewCoinDetector (on-chain polling)
        if ((globalThis as any).heartbeat?.NewCoinDetector) {
            (globalThis as any).heartbeat.NewCoinDetector();
        } else {
            logger.debug('[HEARTBEAT] NewCoinDetector heartbeat function not found');
        }
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
        } catch (error: any) {
            logger.error(`[OnChain] Error in on-chain polling: ${error.message}`);
        await sendAlert(`[NewCoinDetector] Error in on-chain polling: ${error.message}`, 'CRITICAL');
        }
    }

    /**
     * Rate limiter for RPC calls to prevent excessive QuickNode usage
     * Uses both local and global rate limiters for better control
     * @returns true if the call is allowed, false if it should be throttled
     */
    private checkRpcRateLimit(): boolean {
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
            logger.warn(`[RateLimit] Global RPC call limit reached. Throttling.`);
            return false;
        }
        // Increment local counter for this call
        this.rpcCallCount++;
        return true;
    }

    private async pollForNewPools(): Promise<void> {
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
            logger.debug('[Polling] Attempting to fetch pools from Raydium API...');
            const raydiumPools = await this.fetchRaydiumPools();
            logger.debug(`[Polling] Raydium API returned ${raydiumPools ? raydiumPools.length : 0} pools.`);
            
            if (raydiumPools && raydiumPools.length > 0) {
                logger.info(`[Polling] Found ${raydiumPools.length} pools from Raydium API, processing max ${this.MAX_POOLS_TO_PROCESS}`);
                logger.debug(`[Polling] Pool IDs: ${raydiumPools.slice(0, 10).map(p => p.id).join(', ')}${raydiumPools.length > 10 ? ', ...' : ''}`);
                
                // Process only a limited number of pools per cycle to avoid rate limits
                const poolsToProcess = raydiumPools.slice(0, this.MAX_POOLS_TO_PROCESS);
                let processedCount = 0;
                
                for (const pool of poolsToProcess) {
                    logger.debug(`[Polling] Processing pool: ${JSON.stringify(pool)}`);
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
                    try {
                        await this.processRaydiumPool(pool);
                        logger.debug(`[Polling] Successfully processed pool ${pool.id}`);
                    } catch (e) {
                        if (e instanceof Error) {
                            logger.error(`[Polling] Error processing pool ${pool.id}: ${e.message}`);
                        } else {
                            logger.error(`[Polling] Error processing pool ${pool.id}:`, e);
                        }
                    }
                    processedCount++;
                    // Add to processed set
                    this.processedPools.add(pool.id);
                    // Add delay between processing pools to avoid rate limits
                    await sleep(this.DELAY_BETWEEN_POOLS_MS);
                }
                logger.info(`[Polling] Completed processing ${processedCount} new pools.`);
            } else {
                logger.warn('[Polling] No new pools found from Raydium API! Will attempt on-chain fallback.');
                // Check if we should proceed with on-chain polling based on rate limits
                if (typeof localUtilization !== 'undefined' && typeof globalUtilization !== 'undefined' && (localUtilization > 70 || globalUtilization > 70)) {
                    logger.warn(`[RateLimit] Skipping on-chain polling due to high API utilization.`);
                } else {
                    logger.debug('[Polling] Attempting on-chain fallback for new pool detection...');
                    // Fall back to on-chain polling if API doesn't return results
                    await this.pollOnChain();
                }
            }
        } catch (error: any) {
            logger.error(`[Polling] Error polling for new pools: ${error.message}`);
    tradeLogger.logScenario('NEW_COIN_DETECTOR_ERROR', {
      event: 'pollForNewPools',
      error: error?.message || String(error),
      timestamp: new Date().toISOString()
    });
        await sendAlert(`[NewCoinDetector] Error polling for new pools: ${error.message}`, 'CRITICAL');
        } finally {
            this.isPolling = false;
            
            // Log final rate limit status
            const finalLocalUtilization = (this.rpcCallCount / this.MAX_RPC_CALLS_PER_MINUTE) * 100;
            const finalGlobalUtilization = globalRateLimiter.getUtilizationPercent();
            logger.debug(`[Polling] Completed poll cycle. RPC utilization: Local ${finalLocalUtilization.toFixed(0)}%, Global ${finalGlobalUtilization}%`);
        }
    }

    private async processSignature(signature: string): Promise<void> {
        // Skip if we've already processed this signature
        if (this.processedPools.has(signature)) {
            logger.debug(`[NewCoinDetector] Signature already processed, skipping: ${signature}`);
            return;
        }

        // Add to processed set to avoid duplicate processing
        this.processedPools.add(signature);

        // Check both local and global rate limits
        if (!this.checkRpcRateLimit()) {
            logger.warn(`[RateLimit] Skipping signature processing due to rate limiting: ${signature}`);
            return;
        }

        try {
            const tx = await this.connection.getParsedTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!tx || !tx.meta || !tx.transaction) {
                logger.warn(`Invalid transaction data for signature: ${signature}`);
                return;
            }

            // Attempt to extract Raydium pool creation info from instructions
            let poolAddress = '';
            let baseMint = '';
            let quoteMint = '';
            let lpMint = '';
            let market = '';
            let found = false;

            for (const ix of tx.transaction.message.instructions) {
                // Check for Raydium LP V4 program
                if (ix.programId && ix.programId.equals(RAYDIUM_LP_V4_PROGRAM_ID)) {
                    // Try to parse as PartiallyDecodedInstruction
                    if ('data' in ix && typeof ix.data === 'string') {
                        const dataBuf = Buffer.from(ix.data, 'base64');
                        // Check for initialize2 discriminator
                        if (dataBuf.slice(0, 8).equals(INITIALIZE2_DISCRIMINATOR)) {
                            try {
                                // Extract pool fields from the instruction accounts
                                poolAddress = ix.accounts && ix.accounts[0] ? ix.accounts[0].toBase58() : '';
                                lpMint = ix.accounts && ix.accounts[1] ? ix.accounts[1].toBase58() : '';
                                baseMint = ix.accounts && ix.accounts[2] ? ix.accounts[2].toBase58() : '';
                                quoteMint = ix.accounts && ix.accounts[3] ? ix.accounts[3].toBase58() : '';
                                market = ix.accounts && ix.accounts[4] ? ix.accounts[4].toBase58() : '';
                                found = true;
                                break;
                            } catch (decodeErr) {
                                logger.warn(`[processSignature] Failed to decode Raydium pool creation instruction: ${decodeErr}`);
                            }
                        }
                    }
                }
            }

            if (!found || !poolAddress || !baseMint || !quoteMint) {
                logger.debug(`[processSignature] No valid Raydium pool creation instruction found in tx: ${signature}`);
                return;
            }

            const timestamp = tx.blockTime ? tx.blockTime * 1000 : Date.now();
            const event: NewPoolDetectedEvent = {
                poolAddress,
                baseMint,
                quoteMint,
                lpMint,
                market,
                signature,
                timestamp
            };
            debugLogPoolDiscovery('Emitting newPoolDetected', event);
            this.emit('newPoolDetected', event);
            appendPoolDetectionLog(event);
        } catch (error: any) {
            logger.error(`[processSignature] Error processing signature ${signature}: ${error?.stack || JSON.stringify(error) || error}`);
        await sendAlert(`[NewCoinDetector] Error processing signature ${signature}: ${error?.stack || JSON.stringify(error) || error}`, 'CRITICAL');
        }
    }
}