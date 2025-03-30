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
class LiveOrderExecution {
    constructor(connection, wallet, config) {
        this.tokenDecimalsCache = new Map(); // Cache for token decimals
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
     * Executes a swap transaction based on a Jupiter quote.
     * @param quoteResponse The quote response from Jupiter API.
     * @returns {Promise<string | null>} Transaction signature or null if failed.
     */
    async executeSwapTransaction(quoteResponse) {
        try {
            // Get the serialized transaction from Jupiter API
            // Pass parameters directly to swapPost based on potential type issues
            const { swapTransaction } = await this.jupiterApi.swapPost({
                quoteResponse,
                userPublicKey: this.wallet.publicKey.toBase58(),
                wrapAndUnwrapSol: true, // Automatically wrap/unwrap SOL if needed
                dynamicComputeUnitLimit: true, // Let Jupiter estimate compute units
                prioritizationFeeLamports: 'auto' // Use priority fees
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
            // Confirm the transaction
            logger_1.default.info(`Swap transaction sent: ${txid}. Confirming...`);
            const confirmation = await this.connection.confirmTransaction({
                signature: txid,
                blockhash: transaction.message.recentBlockhash,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
            }, 'confirmed');
            if (confirmation.value.err) {
                logger_1.default.error(`Swap transaction failed confirmation: ${txid}`, confirmation.value.err);
                // Consider attempting to fetch transaction details for more info
                // const txDetails = await this.connection.getTransaction(txid, {maxSupportedTransactionVersion: 0});
                // logger.error('Failed Transaction Details:', txDetails?.meta?.logMessages);
                return null;
            }
            logger_1.default.info(`Swap transaction confirmed: ${txid}`);
            return txid;
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
    async buyTokenWithSol(tokenAddress, amountInSolLamports) {
        const solDecimalAmount = Number(amountInSolLamports) / web3_js_1.LAMPORTS_PER_SOL; // For logging
        logger_1.default.info(`Attempting to buy token ${tokenAddress} with ${solDecimalAmount} SOL (${amountInSolLamports} lamports)...`);
        const inputMint = SOL_MINT_ADDRESS;
        const outputMint = tokenAddress;
        try {
            // Fetch decimals (will use cache if available)
            const solDecimals = await this.getTokenDecimals(inputMint);
            const outputTokenDecimals = await this.getTokenDecimals(outputMint);
            // 1. Get Jupiter Quote
            // Pass amount as number to Jupiter API (it expects number, potential precision loss only on astronomical values)
            logger_1.default.debug(`Getting swap quote: Spending ${solDecimalAmount} SOL (${amountInSolLamports} lamports) -> ${outputMint}`);
            const quoteResponse = await this.getSwapQuote(inputMint, outputMint, Number(amountInSolLamports), this.slippageBps);
            if (!quoteResponse) {
                return { success: false, error: 'Failed to get swap quote from Jupiter API', timestamp: Date.now() };
            }
            // 2. Execute Swap Transaction
            const txid = await this.executeSwapTransaction(quoteResponse);
            if (!txid) {
                return { success: false, error: 'Failed to execute swap transaction', timestamp: Date.now() };
            }
            const minAmountOut = quoteResponse.outAmount; // Smallest units of output token
            // Ensure outputAmount is BigInt representing the smallest unit of the output token
            const estimatedTokenAmountSmallestUnit = BigInt(minAmountOut);
            const estimatedTokenAmountDecimal = Number(estimatedTokenAmountSmallestUnit) / Math.pow(10, outputTokenDecimals); // For logging
            // Calculate estimated execution price (SOL per Token)
            const actualExecutionPrice = amountInSolLamports > 0n && estimatedTokenAmountSmallestUnit > 0n
                ? (Number(amountInSolLamports) / web3_js_1.LAMPORTS_PER_SOL) / (Number(estimatedTokenAmountSmallestUnit) / Math.pow(10, outputTokenDecimals))
                : 0;
            logger_1.default.info(`Successfully executed BUY for token ${tokenAddress}. Tx: ${txid}. Estimated received: ~${estimatedTokenAmountDecimal} tokens (${estimatedTokenAmountSmallestUnit} smallest units).`);
            return {
                success: true,
                txSignature: txid,
                inputAmount: amountInSolLamports, // SOL lamports spent
                outputAmount: estimatedTokenAmountSmallestUnit, // Estimated token smallest units received
                actualExecutionPrice: actualExecutionPrice,
                timestamp: Date.now()
            };
        }
        catch (error) {
            logger_1.default.error(`Error buying token ${tokenAddress} with SOL: ${error.message}`, { error });
            const errorType = error.message.includes('Slippage tolerance exceeded') ? 'SLIPPAGE' : 'UNKNOWN';
            return { success: false, error: `Failed to buy token with SOL: ${error.message}`, timestamp: Date.now() };
        }
    }
    /**
     * Sells a specified token for SOL.
     * @param tokenAddress The mint address of the token to sell.
     * @param amountToSellInSmallestUnit The amount of the token (in its smallest unit) to sell.
     * @returns OrderExecutionResult
     */
    async sellTokenForSol(tokenAddress, amountToSellInSmallestUnit) {
        // Fetch decimals
        const inputTokenDecimals = await this.getTokenDecimals(tokenAddress);
        const solDecimals = await this.getTokenDecimals(SOL_MINT_ADDRESS);
        const amountToSellDecimal = Number(amountToSellInSmallestUnit) / Math.pow(10, inputTokenDecimals);
        logger_1.default.info(`Attempting to sell ${amountToSellDecimal} (${amountToSellInSmallestUnit} smallest units) of token ${tokenAddress} for SOL...`);
        const inputMint = tokenAddress;
        const outputMint = SOL_MINT_ADDRESS;
        try {
            // 1. Get Jupiter Quote
            logger_1.default.debug(`Getting swap quote: Selling ${amountToSellDecimal} tokens (${amountToSellInSmallestUnit} smallest units) ${inputMint} -> ${outputMint}`);
            // Convert BigInt to number for API call - potential precision loss for huge amounts, but Jupiter likely handles this range.
            const quoteResponse = await this.getSwapQuote(inputMint, outputMint, Number(amountToSellInSmallestUnit), this.slippageBps);
            if (!quoteResponse) {
                return { success: false, error: 'Failed to get swap quote from Jupiter API', timestamp: Date.now() };
            }
            // 2. Execute Swap Transaction
            const txid = await this.executeSwapTransaction(quoteResponse);
            if (!txid) {
                return { success: false, error: 'Failed to execute swap transaction', timestamp: Date.now() };
            }
            const minAmountOut = quoteResponse.outAmount;
            const estimatedAmountReceivedLamports = BigInt(minAmountOut);
            // Calculate estimated execution price (SOL per Token)
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
            logger_1.default.error(`Error selling token ${tokenAddress} for SOL: ${error.message}`, { error });
            const errorType = error.message.includes('Slippage tolerance exceeded') ? 'SLIPPAGE' : 'UNKNOWN';
            return { success: false, error: `Failed to sell token for SOL: ${error.message}`, timestamp: Date.now() };
        }
    }
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
}
exports.LiveOrderExecution = LiveOrderExecution;
function createOrderExecution(connection, wallet, config) {
    if (!wallet) {
        // Return mock implementation for testing
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
                if (this.tokenDecimalsCache.has(tokenAddress)) {
                    return this.tokenDecimalsCache.get(tokenAddress);
                }
                // Simulate fetching for unknown tokens in mock
                logger_1.default.info(`Mock fetching decimals for ${tokenAddress}`);
                const mockDecimals = 6; // Default mock
                this.tokenDecimalsCache.set(tokenAddress, mockDecimals);
                return mockDecimals;
            }
        };
    }
    // Return live implementation
    const liveExecution = new LiveOrderExecution(connection, wallet, config);
    return liveExecution;
}
