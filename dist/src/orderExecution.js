"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveOrderExecution = void 0;
exports.createOrderExecution = createOrderExecution;
const web3_js_1 = require("@solana/web3.js");
const api_1 = require("@jup-ag/api");
const logger_1 = __importDefault(require("./utils/logger"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config(); // Load environment variables from .env file
// Constants - Consider moving to config
const SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';
const USDC_MINT_ADDRESS = process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Default to mainnet USDC
/**
 * Utility function to pause execution for a specified duration.
 * @param ms - The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified duration.
 */
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
class LiveOrderExecution {
    /**
     * Stop/cleanup method for tests and integration
     */
    stop() {
        // Add any interval cleanup or resource release here if needed
        logger_1.default.info('LiveOrderExecution stopped');
    }
    connection;
    wallet;
    jupiterApi; // Type will be inferred from createJupiterApiClient
    slippageBps;
    tokenDecimalsCache = new Map(); // Cache for token decimals
    constructor(connection, wallet, config) {
        this.connection = connection;
        this.wallet = wallet;
        this.slippageBps = config?.slippageBps ?? 50; // Default 0.5% slippage
        this.jupiterApi = (0, api_1.createJupiterApiClient)(); // Type is inferred here
        // Pre-cache common decimals
        this.tokenDecimalsCache.set(SOL_MINT_ADDRESS, 9);
        this.tokenDecimalsCache.set(USDC_MINT_ADDRESS, 6);
        logger_1.default.info(`LiveOrderExecution initialized with slippage: ${this.slippageBps} BPS`);
    }
    /**
     * Fetches and caches the decimals for a given token mint.
     * @param tokenMint The mint address of the token.
     * @returns The number of decimals.
     */
    async getTokenDecimals(tokenMint) {
        if (this.tokenDecimalsCache.has(tokenMint)) {
            return this.tokenDecimalsCache.get(tokenMint);
        }
        logger_1.default.debug(`Fetching decimals for mint: ${tokenMint}`);
        try {
            const mintPublicKey = new web3_js_1.PublicKey(tokenMint);
            const info = await this.connection.getParsedAccountInfo(mintPublicKey);
            if (!info || !info.value || !('parsed' in info.value.data)) {
                throw new Error('Failed to retrieve parsed account info or data is not parsed');
            }
            // Check if the account is indeed a mint account and has decimals
            if (info.value.data.program === 'spl-token' && info.value.data.parsed.type === 'mint') {
                const decimals = info.value.data.parsed.info.decimals;
                if (typeof decimals === 'number') {
                    this.tokenDecimalsCache.set(tokenMint, decimals);
                    logger_1.default.debug(`Cached decimals for ${tokenMint}: ${decimals}`);
                    return decimals;
                }
            }
            throw new Error('Account is not a valid SPL token mint or decimals not found');
        }
        catch (error) {
            logger_1.default.error(`Failed to fetch decimals for ${tokenMint}: ${error.message}`);
            // Default to a common value (e.g., 6 or 9) or rethrow? Rethrowing is safer.
            // For now, let's throw to make the issue visible upstream.
            throw new Error(`Could not determine decimals for token ${tokenMint}`);
        }
    }
    /**
     * Fetches a swap quote from Jupiter API.
     * @param inputMint Input token mint address.
     * @param outputMint Output token mint address.
     * @param amount Amount of input token in smallest unit (e.g., lamports).
     * @param slippageBps Slippage tolerance in basis points.
     * @returns {Promise<QuoteResponse | null>} The quote response or null if failed.
     */
    async getSwapQuote(inputMint, outputMint, amount, // Amount in smallest unit (lamports for SOL, atomic units for tokens)
    slippageBps) {
        logger_1.default.debug(`Fetching swap quote: ${amount} ${inputMint} -> ${outputMint} (Slippage: ${slippageBps} BPS)`);
        try {
            const quoteRequest = {
                inputMint,
                outputMint,
                amount,
                slippageBps,
                // Optional: platformFeeBps: 10, // Example platform fee
                // Optional: onlyDirectRoutes: false, // Consider direct routes only
                // Optional: asLegacyTransaction: false, // Use versioned transactions
            };
            const quoteResponse = await this.jupiterApi.quoteGet(quoteRequest);
            if (!quoteResponse) {
                logger_1.default.error('Failed to get swap quote from Jupiter API.');
                return null;
            }
            logger_1.default.debug('Received Jupiter Quote:', quoteResponse);
            return quoteResponse;
        }
        catch (error) {
            logger_1.default.error('Error fetching Jupiter swap quote:', error?.message || error);
            return null;
        }
    }
    /**
     * Simulates a swap transaction using Jupiter's quote (preflight check).
     * Returns true if simulation passes, false otherwise.
     */
    async simulateSwap(quoteResponse) {
        try {
            // Get the serialized transaction from Jupiter API (same as in executeSwapTransaction)
            const { swapTransaction } = await this.jupiterApi.swapPost({
                swapRequest: {
                    quoteResponse,
                    userPublicKey: this.wallet.publicKey.toBase58(),
                    wrapAndUnwrapSol: true,
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: {
                        priorityLevelWithMaxLamports: {
                            maxLamports: 1000000,
                            priorityLevel: "high"
                        }
                    }
                }
            });
            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = web3_js_1.VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([this.wallet]);
            // Simulate
            const simResult = await this.connection.simulateTransaction(transaction);
            if (simResult.value.err) {
                logger_1.default.warn('Swap simulation failed:', simResult.value.err);
                return false;
            }
            logger_1.default.info('Swap simulation passed.');
            return true;
        }
        catch (error) {
            logger_1.default.error('Error simulating swap transaction:', error?.message || error);
            return false;
        }
    }
    /**
     * Executes a swap transaction based on a Jupiter quote.
     * @param quoteResponse The quote response from Jupiter API.
     * @returns {Promise<string | null>} Transaction signature or null if failed.
     */
    async executeSwapTransaction(quoteResponse) {
        try {
            // Get the serialized transaction from Jupiter API
            const { swapTransaction } = await this.jupiterApi.swapPost({
                swapRequest: {
                    quoteResponse,
                    userPublicKey: this.wallet.publicKey.toBase58(),
                    wrapAndUnwrapSol: true, // Automatically wrap/unwrap SOL if needed
                    dynamicComputeUnitLimit: true, // Let Jupiter estimate compute units
                    prioritizationFeeLamports: {
                        priorityLevelWithMaxLamports: {
                            maxLamports: 1000000, // e.g., 0.001 SOL
                            priorityLevel: "high"
                        }
                    }
                }
            });
            // Deserialize the transaction
            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = web3_js_1.VersionedTransaction.deserialize(swapTransactionBuf);
            // Sign the transaction
            transaction.sign([this.wallet]);
            // Execute the transaction
            const rawTransaction = transaction.serialize();
            const txid = await this.connection.sendRawTransaction(rawTransaction, {
                skipPreflight: true, // Often recommended for Jupiter swaps
                maxRetries: 5,
            });
            // Confirm the transaction with retries
            logger_1.default.info(`Swap transaction sent: ${txid}. Confirming with retries...`);
            const maxConfirmationRetries = 5;
            const retryDelayMs = 3000; // 3 seconds delay between retries
            for (let attempt = 1; attempt <= maxConfirmationRetries; attempt++) {
                logger_1.default.debug(`Confirmation attempt ${attempt}/${maxConfirmationRetries} for tx ${txid}`);
                try {
                    const confirmation = await this.connection.confirmTransaction({
                        signature: txid,
                        blockhash: transaction.message.recentBlockhash,
                        lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
                    }, 'confirmed' // Use 'confirmed' commitment level
                    );
                    if (!confirmation.value.err) {
                        logger_1.default.info(`Swap transaction confirmed successfully on attempt ${attempt}: ${txid}`);
                        return txid;
                    }
                    else {
                        logger_1.default.warn(`Confirmation attempt ${attempt} failed for tx ${txid}: ${confirmation.value.err}`);
                        // Optional: Log transaction details on final failure if needed
                        // if (attempt === maxConfirmationRetries) {
                        //   const txDetails = await this.connection.getTransaction(txid, {maxSupportedTransactionVersion: 0});
                        //   logger.error('Failed Transaction Details after final retry:', txDetails?.meta?.logMessages);
                        // }
                    }
                }
                catch (error) {
                    logger_1.default.warn(`Error during confirmation attempt ${attempt} for tx ${txid}: ${error.message}`);
                }
                // Wait before retrying, unless it's the last attempt
                if (attempt < maxConfirmationRetries) {
                    await sleep(retryDelayMs);
                }
            }
            logger_1.default.error(`Swap transaction ${txid} failed to confirm after ${maxConfirmationRetries} attempts.`);
            return null; // Failed to confirm after retries
        }
        catch (error) {
            logger_1.default.error('Error executing Jupiter swap transaction:', error?.message || error);
            if (error?.logs) {
                logger_1.default.error('Transaction Logs:', error.logs);
            }
            return null;
        }
    }
    /**
     * Buys a specified token using SOL.
     * @param tokenAddress The mint address of the token to buy.
     * @param amountInSolLamports The amount of SOL (in lamports) to spend.
     * @returns OrderExecutionResult
     */
    /**
     * Attempts a buy with retry and simulation logic.
     */
    async buyTokenWithSol(tokenAddress, amountInSolLamports) {
        const solDecimalAmount = Number(amountInSolLamports) / web3_js_1.LAMPORTS_PER_SOL; // For logging
        logger_1.default.info(`Attempting to buy token ${tokenAddress} with ${solDecimalAmount} SOL (${amountInSolLamports} lamports)...`);
        const inputMint = SOL_MINT_ADDRESS;
        const outputMint = tokenAddress;
        let lastError = null;
        let quoteResponse = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // Fetch decimals (will use cache if available)
                const solDecimals = await this.getTokenDecimals(inputMint);
                const outputTokenDecimals = await this.getTokenDecimals(outputMint);
                // 1. Get Jupiter Quote
                logger_1.default.debug(`Getting swap quote: Spending ${solDecimalAmount} SOL (${amountInSolLamports} lamports) -> ${outputMint}`);
                quoteResponse = await this.getSwapQuote(inputMint, outputMint, Number(amountInSolLamports), this.slippageBps);
                if (!quoteResponse)
                    throw new Error('Failed to get swap quote from Jupiter API');
                // 2. Simulate Transaction
                const simOk = await this.simulateSwap(quoteResponse);
                if (!simOk)
                    throw new Error('Swap simulation failed');
                // 3. Execute Swap Transaction
                const txid = await this.executeSwapTransaction(quoteResponse);
                if (!txid)
                    throw new Error('Failed to execute swap transaction');
                const minAmountOut = quoteResponse.outAmount;
                const estimatedTokenAmountSmallestUnit = BigInt(minAmountOut);
                const estimatedTokenAmountDecimal = Number(estimatedTokenAmountSmallestUnit) / Math.pow(10, outputTokenDecimals);
                const actualExecutionPrice = amountInSolLamports > 0n && estimatedTokenAmountSmallestUnit > 0n
                    ? (Number(amountInSolLamports) / web3_js_1.LAMPORTS_PER_SOL) / (Number(estimatedTokenAmountSmallestUnit) / Math.pow(10, outputTokenDecimals))
                    : 0;
                logger_1.default.info(`Successfully executed BUY for token ${tokenAddress}. Tx: ${txid}. Estimated received: ~${estimatedTokenAmountDecimal} tokens (${estimatedTokenAmountSmallestUnit} smallest units).`);
                return {
                    success: true,
                    txSignature: txid,
                    inputAmount: amountInSolLamports,
                    outputAmount: estimatedTokenAmountSmallestUnit,
                    actualExecutionPrice: actualExecutionPrice,
                    timestamp: Date.now()
                };
            }
            catch (error) {
                lastError = error;
                logger_1.default.error(`BUY attempt ${attempt} failed: ${error.message}`);
                if (attempt < 3)
                    await sleep(1000 * attempt); // Exponential backoff
            }
        }
        // Alert after 3 failed attempts
        logger_1.default.error(`Failed to buy token ${tokenAddress} with SOL after 3 attempts.`);
        // If you have an alert system, call it here
        // await sendAlert(`Failed to buy token ${tokenAddress} after 3 attempts: ${lastError?.message}`,'ERROR');
        return { success: false, error: `Failed to buy token with SOL after 3 attempts: ${lastError?.message}`, timestamp: Date.now() };
    }
    /**
     * Sells a specified token for SOL.
     * @param tokenAddress The mint address of the token to sell.
     * @param amountToSellInSmallestUnit The amount of the token (in its smallest unit) to sell.
     * @returns OrderExecutionResult
     */
    /**
     * Attempts a sell with retry and simulation logic.
     */
    /**
     * Executes a trade order (buy or sell) and returns the result.
     * Implements OrderExecution interface.
     */
    async executeOrder(order) {
        try {
            if (order.side === 'buy') {
                logger_1.default.info(`Executing BUY order for token ${order.tokenAddress} with ~${Number(order.size) / web3_js_1.LAMPORTS_PER_SOL} SOL (${order.size} lamports)`);
                // Assuming order.size for a BUY is the amount of SOL (in lamports) to spend
                return await this.buyTokenWithSol(order.tokenAddress, BigInt(order.size));
            }
            else { // sell
                // Need token decimals for logging the decimal amount
                // We'll log the smallest unit amount here, buy/sell methods log decimal amounts
                logger_1.default.info(`Executing SELL order for ${order.size} smallest units of ${order.tokenAddress}`);
                // Assuming order.size for a SELL is the amount of the token (in its smallest unit) to sell
                return await this.sellTokenForSol(order.tokenAddress, BigInt(order.size));
            }
        }
        catch (error) {
            logger_1.default.error('Error executing order:', error?.message || error);
            return {
                success: false,
                error: error?.message || 'Unknown error',
                timestamp: Date.now()
            };
        }
    }
    async sellTokenForSol(tokenAddress, amountToSellInSmallestUnit) {
        let lastError = null;
        let quoteResponse = null;
        const inputTokenDecimals = await this.getTokenDecimals(tokenAddress);
        const solDecimals = await this.getTokenDecimals(SOL_MINT_ADDRESS);
        const amountToSellDecimal = Number(amountToSellInSmallestUnit) / Math.pow(10, inputTokenDecimals);
        logger_1.default.info(`Attempting to sell ${amountToSellDecimal} (${amountToSellInSmallestUnit} smallest units) of token ${tokenAddress} for SOL...`);
        const inputMint = tokenAddress;
        const outputMint = SOL_MINT_ADDRESS;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // 1. Get Jupiter Quote
                logger_1.default.debug(`Getting swap quote: Selling ${amountToSellDecimal} tokens (${amountToSellInSmallestUnit} smallest units) ${inputMint} -> ${outputMint}`);
                quoteResponse = await this.getSwapQuote(inputMint, outputMint, Number(amountToSellInSmallestUnit), this.slippageBps);
                if (!quoteResponse)
                    throw new Error('Failed to get swap quote from Jupiter API');
                // 2. Simulate Transaction
                const simOk = await this.simulateSwap(quoteResponse);
                if (!simOk)
                    throw new Error('Swap simulation failed');
                // 3. Execute Swap Transaction
                const txid = await this.executeSwapTransaction(quoteResponse);
                if (!txid)
                    throw new Error('Failed to execute swap transaction');
                const minAmountOut = quoteResponse.outAmount;
                const estimatedAmountReceivedLamports = BigInt(minAmountOut);
                const actualExecutionPrice = estimatedAmountReceivedLamports > 0n && amountToSellInSmallestUnit > 0n
                    ? (Number(estimatedAmountReceivedLamports) / web3_js_1.LAMPORTS_PER_SOL) / (Number(amountToSellInSmallestUnit) / Math.pow(10, inputTokenDecimals))
                    : 0;
                logger_1.default.info(`Successfully executed SELL for token ${tokenAddress}. Tx: ${txid}. Estimated received: ${Number(estimatedAmountReceivedLamports) / Math.pow(10, solDecimals)} SOL (${estimatedAmountReceivedLamports} lamports, ${solDecimals} decimals).`);
                return {
                    success: true,
                    txSignature: txid,
                    inputAmount: amountToSellInSmallestUnit,
                    outputAmount: estimatedAmountReceivedLamports,
                    actualExecutionPrice: actualExecutionPrice,
                    timestamp: Date.now()
                };
            }
            catch (error) {
                lastError = error;
                logger_1.default.error(`SELL attempt ${attempt} failed: ${error.message}`);
                if (attempt < 3)
                    await sleep(1000 * attempt);
            }
        }
        logger_1.default.error(`Failed to sell token ${tokenAddress} for SOL after 3 attempts.`);
        // If you have an alert system, call it here
        // await sendAlert(`Failed to sell token ${tokenAddress} after 3 attempts: ${lastError?.message}`,'ERROR');
        return { success: false, error: `Failed to sell token for SOL after 3 attempts: ${lastError?.message}`, timestamp: Date.now() };
    }
}
exports.LiveOrderExecution = LiveOrderExecution;
function createOrderExecution(connection, wallet, config) {
    if (!wallet) {
        // Define cache outside the returned object, accessible via closure
        const mockDecimalsCache = new Map([
            [SOL_MINT_ADDRESS, 9],
            [USDC_MINT_ADDRESS, 6],
        ]);
        return {
            async executeOrder(order) {
                try {
                    const tokenPubkey = new web3_js_1.PublicKey(order.tokenAddress);
                    logger_1.default.info('Mock order execution', {
                        token: tokenPubkey.toString(),
                        side: order.side,
                        size: order.size,
                        price: order.price
                    });
                    return { success: true, txSignature: `mock_tx_${Date.now()}`, timestamp: Date.now() };
                }
                catch (error) {
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    return {
                        success: false,
                        error: msg,
                        timestamp: Date.now()
                    };
                }
            },
            async getTokenDecimals(tokenAddress) {
                // Mock implementation
                // Use the mock's own cache
                if (mockDecimalsCache.has(tokenAddress)) {
                    return mockDecimalsCache.get(tokenAddress);
                }
                // Simulate fetching for unknown tokens in mock
                logger_1.default.info(`Mock fetching decimals for ${tokenAddress}`);
                const mockDecimals = 6; // Default mock
                mockDecimalsCache.set(tokenAddress, mockDecimals);
                return mockDecimals;
            }
        };
    }
    // Return live implementation
    const liveExecution = new LiveOrderExecution(connection, wallet, config);
    return liveExecution;
}
//# sourceMappingURL=orderExecution.js.map