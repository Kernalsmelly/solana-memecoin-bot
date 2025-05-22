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
    // ... existing properties and constructor ...
    // Ensure manageRecentlyProcessedSet is a method of this class
    connection;
    config;
    jupiterApi;
    processedSignatures = new Set();
    pollingActive = false; // Flag to control polling loop
    pollingIntervalId = null; // Stores the timeout ID
    pollingIntervalMs; // Stores the interval duration
    isPolling = false; // Flag for active poll execution
    lastProcessedSignatureForPolling = ""; // Marker for the next poll, now always a string
    constructor(connection, config) {
        super();
        this.connection = connection;
        this.config = config;
        this.pollingIntervalMs = config.tokenMonitor.pollingIntervalSeconds * 1000; // Initialize interval duration
        this.jupiterApi = (0, api_1.createJupiterApiClient)(); // Initialize Jupiter API client
        logger_1.default.info("NewCoinDetector initialized.");
        logger_1.default.info(`Using RPC endpoint: ${connection.rpcEndpoint}`);
    }
    /**
     * Manages the size of the processed signatures set, keeping only the most recent maxSize entries.
     */
    manageRecentlyProcessedSet(set, key, maxSize) {
        set.add(key);
        if (set.size > maxSize) {
            const oldest = set.values().next().value;
            set.delete(oldest);
        }
    }
    start() {
        logger_1.default.info(`Starting New Coin Detector (Polling Mode)... Interval: ${this.config.tokenMonitor.pollingIntervalSeconds} seconds`);
        this.pollingActive = true; // Set flag
        this.isPolling = false; // Reset execution flag
        this.lastProcessedSignatureForPolling = ""; // Reset last signature to empty string
        this.processedSignatures.clear(); // Clear processed set on start
        // Clear any existing timeout just in case
        if (this.pollingIntervalId) {
            clearTimeout(this.pollingIntervalId);
            this.pollingIntervalId = null;
        }
        this.pollForNewPools(); // Start the first poll immediately
    }
    stop() {
        logger_1.default.info('Stopping New Coin Detector (Polling Mode)...');
        this.pollingActive = false; // Clear flag
        if (this.pollingIntervalId) {
            clearTimeout(this.pollingIntervalId);
            this.pollingIntervalId = null;
            logger_1.default.debug('[Polling] Cleared scheduled poll timeout.');
        }
    }
    async pollForNewPools() {
        if (this.isPolling) {
            logger_1.default.debug('[Polling] Poll already in progress, skipping.');
            return;
            this.isPolling = true;
            logger_1.default.info('[Polling] Starting poll for new pools...'); // Changed from debug to info for visibility
            try {
                const options = {
                    limit: 100, // Fetch last 100 signatures
                    // Use 'before' to get signatures *newer* than the last processed one
                    before: this.lastProcessedSignatureForPolling
                };
                logger_1.default.debug(`[Polling] Fetching signatures from RPC: ${this.connection.rpcEndpoint} with options: ${JSON.stringify(options)}`);
                // Fetch signatures
                const signaturesInfo = await this.connection.getSignaturesForAddress(RAYDIUM_LP_V4_PROGRAM_ID, options, 'confirmed' // Keep using 'confirmed' as in original code
                );
                if (!signaturesInfo || signaturesInfo.length === 0) {
                    logger_1.default.debug('[Polling] No new signatures found.');
                    // No return here, proceed to finally block
                }
                else {
                    logger_1.default.info(`[Polling] Found ${signaturesInfo.length} potential new signatures.`);
                    // Update the marker for the *next* poll *before* processing
                    // The first signature in the result is the newest one when using 'before'
                    const newestSignature = signaturesInfo[0]?.signature;
                    if (newestSignature) {
                        this.lastProcessedSignatureForPolling = newestSignature;
                        logger_1.default.debug(`[Polling] New 'lastProcessedSignatureForPolling' marker set to: ${this.lastProcessedSignatureForPolling}`);
                    }
                    else {
                        logger_1.default.warn('[Polling] Received signatures array but the first element was missing a signature string.');
                    }
                    // Filter out signatures we've already processed (using the main processed set)
                    // No need to reverse when using 'before', newest are already first
                    const signaturesToProcess = signaturesInfo
                        .filter(sigInfo => !this.processedSignatures.has(sigInfo.signature));
                    if (signaturesToProcess.length === 0) {
                        logger_1.default.debug('[Polling] All found signatures were already processed.');
                        // No return here, proceed to finally block
                    }
                    else {
                        logger_1.default.info(`[Polling] Processing ${signaturesToProcess.length} new signatures.`);
                        const batchSize = 10; // Process 10 concurrently
                        let processedCount = 0;
                        for (let i = 0; i < signaturesToProcess.length; i += batchSize) {
                            const batchSignaturesInfo = signaturesToProcess.slice(i, i + batchSize);
                            const batchNumber = Math.floor(i / batchSize) + 1;
                            const totalBatches = Math.ceil(signaturesToProcess.length / batchSize);
                            logger_1.default.info(`[Polling] Processing batch ${batchNumber}/${totalBatches} containing ${batchSignaturesInfo.length} signatures...`);
                            // Create promises for processing each signature in the batch
                            const promises = batchSignaturesInfo.map(sigInfo => {
                                this.processedSignatures.add(sigInfo.signature); // Add to processed set *before* starting async task
                                // Note: Using processSignature, assuming analyzeNewPoolTransaction is called within it
                                return this.processSignature(sigInfo.signature)
                                    .catch(error => ({ signature: sigInfo.signature, error })); // Catch errors within the promise
                            });
                            // Wait for the current batch to complete
                            const results = await Promise.allSettled(promises);
                            // Log any errors from the batch processing
                            results.forEach((result) => {
                                if (result.status === 'rejected') {
                                    logger_1.default.error(`[Polling] Batch Error (Rejected Promise): ${result.reason}`);
                                }
                                else if (result.status === 'fulfilled' && result.value?.error) {
                                    logger_1.default.error(`[Polling] Error processing signature ${result.value.signature}: ${result.value.error?.message || result.value.error}`);
                                }
                                processedCount++;
                            });
                            // Add a small delay between batches
                            if (i + batchSize < signaturesToProcess.length) {
                                // Schedule next poll ONLY if polling is still active
                                if (this.pollingActive) {
                                    debugLogPoolDiscovery('Fetching transaction details', { signature });
                                    try {
                                        // Fetch the transaction details
                                        // Use maxSupportedTransactionVersion: 0 to ensure legacy transaction format is parsed correctly if needed
                                        const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
                                        if (!tx) {
                                            logger_1.default.warn(`[Processor] Failed to fetch transaction details for signature: ${signature}`);
                                            // Mark as processed even if failed to fetch
                                            this.processedSignatures.add(signature);
                                            this.manageRecentlyProcessedSet(this.processedSignatures, signature, this.config.tokenMonitor.maxSignaturesToStore ?? 1000);
                                            return;
                                        }
                                        if (tx.meta?.err) {
                                            logger_1.default.debug(`[Processor] Transaction ${signature} failed: ${JSON.stringify(tx.meta.err)}. Skipping.`);
                                            // Mark failed transactions as processed
                                            this.processedSignatures.add(signature);
                                            this.manageRecentlyProcessedSet(this.processedSignatures, signature, this.config.tokenMonitor.maxSignaturesToStore ?? 1000);
                                            return;
                                        }
                                        // Process instructions
                                        for (const ix of tx.transaction.message.instructions) {
                                            // Check if it's a PartiallyDecodedInstruction (more likely for program calls)
                                            if ('accounts' in ix && 'data' in ix && 'programId' in ix) {
                                                const instruction = ix;
                                                // Log if we find ANY instruction matching the Raydium V4 Program ID
                                                if (instruction.programId.equals(RAYDIUM_LP_V4_PROGRAM_ID)) {
                                                    logger_1.default.debug(`[DETECTION] Found Raydium V4 instruction in tx: ${signature}`);
                                                    try {
                                                        // Ensure data is valid base58 before decoding
                                                        if (typeof instruction.data === 'string' && /^[1-9A-HJ-NP-Za-km-z]+$/.test(instruction.data)) {
                                                            const decodedDataBuffer = Buffer.from(bs58_1.default.decode(instruction.data));
                                                            logger_1.default.debug(`[DETECTION] Decoded data (first 16 bytes): ${decodedDataBuffer.slice(0, 16).toString('hex')}`);
                                                            logger_1.default.debug(`[DETECTION] Expected discriminator:      ${INITIALIZE2_DISCRIMINATOR.toString('hex')}`);
                                                            // Check if it's the initialize2 instruction using the discriminator
                                                            if (this.isInitialize2Discriminator(decodedDataBuffer)) {
                                                                logger_1.default.info(`[DETECTION] Found initialize2 instruction in transaction: ${signature}`);
                                                                // Extract account indices (ensure they exist and are numbers)
                                                                const accountIndices = {
                                                                    amm: instruction.accounts[1],
                                                                    lpMint: instruction.accounts[4],
                                                                    coinMint: instruction.accounts[5],
                                                                    pcMint: instruction.accounts[6],
                                                                    serumMarket: instruction.accounts[15], // Assuming market is at index 15
                                                                };
                                                                // Validate indices and extract PublicKeys
                                                                const accountKeys = tx.transaction.message.accountKeys;
                                                                // Robust index and key validation
                                                                if (typeof accountIndices.amm === 'number' && accountIndices.amm < accountKeys.length && accountKeys[accountIndices.amm] &&
                                                                    typeof accountIndices.lpMint === 'number' && accountIndices.lpMint < accountKeys.length && accountKeys[accountIndices.lpMint]) {
                                                                    // ... your logic here (e.g., set params, call analyzeNewPoolTransaction, etc.)
                                                                }
                                                            }
                                                        }
                                                    }
                                                    catch (error) {
                                                        logger_1.default.error(`[Processor] Error processing signature ${signature}:`, error);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    catch (error) {
                                        logger_1.default.error(`[Processor] Error processing signature ${signature}:`, error);
                                    }
                                    finally {
                                        // Mark as processed AFTER checking all instructions, even on error
                                        this.processedSignatures.add(signature);
                                        this.manageRecentlyProcessedSet(this.processedSignatures, signature, this.config.tokenMonitor.maxSignaturesToStore ?? 1000);
                                    }
                                }
                                // Process instructions
                                for (const ix of tx.transaction.message.instructions) {
                                    // Check if it's a PartiallyDecodedInstruction (more likely for program calls)
                                    if ('accounts' in ix && 'data' in ix && 'programId' in ix) {
                                        const instruction = ix;
                                        // Log if we find ANY instruction matching the Raydium V4 Program ID
                                        if (instruction.programId.equals(RAYDIUM_LP_V4_PROGRAM_ID)) {
                                            logger_1.default.debug(`[DETECTION] Found Raydium V4 instruction in tx: ${signature}`);
                                            try {
                                                // Ensure data is valid base58 before decoding
                                                if (typeof instruction.data === 'string' && /^[1-9A-HJ-NP-Za-km-z]+$/.test(instruction.data)) {
                                                    const decodedDataBuffer = Buffer.from(bs58_1.default.decode(instruction.data)); // Convert Uint8Array to Buffer
                                                    logger_1.default.debug(`[DETECTION] Decoded data (first 16 bytes): ${decodedDataBuffer.slice(0, 16).toString('hex')}`);
                                                    logger_1.default.debug(`[DETECTION] Expected discriminator:      ${INITIALIZE2_DISCRIMINATOR.toString('hex')}`);
                                                    // Check if it's the initialize2 instruction using the discriminator
                                                    if (this.isInitialize2Discriminator(decodedDataBuffer)) { // Pass Buffer
                                                        logger_1.default.info(`[DETECTION] Found initialize2 instruction in transaction: ${signature}`);
                                                        // Extract account indices (ensure they exist and are numbers)
                                                    }
                                                }
                                            }
                                            finally { }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            finally { }
        }
    }
}
exports.NewCoinDetector = NewCoinDetector;
//# sourceMappingURL=newCoinDetector.js.map