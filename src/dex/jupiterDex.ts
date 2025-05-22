import { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction, VersionedTransaction, ParsedAccountData } from '@solana/web3.js';
import { createJupiterApiClient, QuoteResponse, SwapResponse, Instruction, SwapRequest } from '@jup-ag/api';
import { TokenInfo } from '@solana/spl-token-registry';
import JSBI from 'jsbi';
import Decimal from 'decimal.js';
import logger from '../utils/logger';
import { RiskManager, CircuitBreakerReason } from '../live/riskManager';
import { Buffer } from 'buffer';

export interface JupiterQuote {
    originalQuote: QuoteResponse; 
    price: string;        
    priceImpactPct: number;
    inAmount: string;     
    outAmount: string;    
    inputMint: string;
    outputMint: string;
    route: QuoteResponse; 
}

export interface JupiterSwapResult {
    success: boolean;
    signature?: string;
    error?: string;
    outAmount?: number;
    price?: number;
    errorType?: string;
}

export interface RiskParams {
    maxSlippageBps: number;
    maxPriceImpactPct: number;
    minLiquidityUsd: number;
    maxPositionSizeUsd: number;
    maxPortfolioExposure: number;
}

const DEFAULT_RISK_PARAMS: RiskParams = {
    maxSlippageBps: 100, // 1%
    maxPriceImpactPct: 5, // 5%
    minLiquidityUsd: 50000, // $50k
    maxPositionSizeUsd: 1000, // $1k
    maxPortfolioExposure: 0.1 // 10%
};

// Error types for better error handling
export enum JupiterErrorType {
    INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
    INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
    HIGH_PRICE_IMPACT = 'HIGH_PRICE_IMPACT',
    NO_ROUTE_FOUND = 'NO_ROUTE_FOUND',
    TRANSACTION_ERROR = 'TRANSACTION_ERROR',
    CIRCUIT_BREAKER_ACTIVE = 'CIRCUIT_BREAKER_ACTIVE',
    EMERGENCY_STOP_ACTIVE = 'EMERGENCY_STOP_ACTIVE',
    SYSTEM_DISABLED = 'SYSTEM_DISABLED',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    INVALID_MINT_ADDRESS = 'INVALID_MINT_ADDRESS',
    EXCEEDS_MAX_POSITION_SIZE = 'EXCEEDS_MAX_POSITION_SIZE',
    WALLET_SIGN_REJECTED = 'WALLET_SIGN_REJECTED',
    SWAP_EXECUTION_FAILED = 'SWAP_EXECUTION_FAILED',
    TRANSACTION_CONFIRMATION_FAILURE = 'TRANSACTION_CONFIRMATION_FAILURE',
    API_CLIENT_NOT_INITIALIZED = 'API_CLIENT_NOT_INITIALIZED',
    CONNECTION_NOT_INITIALIZED = 'CONNECTION_NOT_INITIALIZED',
    NO_TRANSACTION_RETURNED = 'NO_TRANSACTION_RETURNED'
}

export class JupiterError extends Error {
    constructor(
        public type: JupiterErrorType,
        message: string,
        public details?: any
    ) {
        super(message);
        this.name = 'JupiterError';
    }
}

// Define a minimal interface for the V6 API client based on usage
interface JupiterApiClient {
    quote(params: {
        inputMint: string;
        outputMint: string;
        amount: number; // Expecting lamports
        slippageBps?: number;
        // asLegacyTransaction?: boolean; // Example of other potential param
    }): Promise<QuoteResponse | null>;

    swapPost(params: {
        swapRequest: SwapRequest;
    }): Promise<SwapResponse>;
}

// Interface for the expected wallet object structure
interface SignerWallet {
    publicKey: PublicKey;
    signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
}

export class JupiterDex {
    private connection: Connection;
    private wallet: Keypair;
    private riskParams: RiskParams;
    private retryAttempts: number = 3;
    private retryDelayMs: number = 1000;
    private riskManager: RiskManager | null = null;
    private lastApiCallTimestamp: number = 0;
    private rateLimitWindowMs: number = 500; // 500ms between API calls
    // Use the explicit interface for the API client
    private jupiterApi: JupiterApiClient;
    private tokenDecimalsCache: Map<string, number>;

    constructor(
        connection: Connection, 
        wallet: Keypair,
        riskParams: Partial<RiskParams> = {},
        riskManager?: RiskManager
    ) {
        this.connection = connection;
        this.wallet = wallet;
        this.riskParams = { ...DEFAULT_RISK_PARAMS, ...riskParams };
        this.riskManager = riskManager || null;
        // Use double cast (via unknown) as suggested by TS compiler
        this.jupiterApi = createJupiterApiClient() as unknown as JupiterApiClient;
        this.tokenDecimalsCache = new Map<string, number>();
    }

    private async getTokenSymbol(tokenAddress: string): Promise<string | null> {
        // Placeholder - V6 might make this less necessary
        logger.warn('getTokenSymbol may need refactoring or removal for V6 API');
        return tokenAddress; // Return address as placeholder symbol
    }

    private async checkRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCallTimestamp;
        
        if (timeSinceLastCall < this.rateLimitWindowMs) {
            const waitTime = this.rateLimitWindowMs - timeSinceLastCall;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastApiCallTimestamp = Date.now();
    }

    private async getTokenDecimals(mintAddress: string): Promise<number> {
        if (this.tokenDecimalsCache.has(mintAddress)) {
            return this.tokenDecimalsCache.get(mintAddress)!;
        }

        try {
            // Use getParsedAccountInfo to fetch mint decimals
            const mintPublicKey = new PublicKey(mintAddress);
            const mintAccountInfo = await this.connection.getParsedAccountInfo(mintPublicKey, 'confirmed');

            if (!mintAccountInfo || !mintAccountInfo.value || !mintAccountInfo.value.data) {
                throw new Error('Mint account not found or has no data.');
            }

            // Check if the account data is parsed and is a mint account
            const parsedData = mintAccountInfo.value.data as ParsedAccountData; // Type assertion
            if (!parsedData || parsedData.program !== 'spl-token' || parsedData.parsed?.type !== 'mint') {
                throw new Error('Account is not a valid SPL Token mint account.');
            }

            // Extract decimals directly from parsed info
            const decimals = parsedData.parsed.info.decimals;
            if (typeof decimals !== 'number') {
                throw new Error('Decimals not found in parsed mint info.');
            }

            this.tokenDecimalsCache.set(mintAddress, decimals);
            return decimals;

        } catch (error) {
            logger.error(`Failed to fetch decimals for mint ${mintAddress}:`, { error });
            throw new JupiterError(
                JupiterErrorType.INVALID_MINT_ADDRESS,
                `Failed to fetch decimals for mint: ${mintAddress}`,
                error
            );
        }
    }

    private async validatePositionSize(quote: QuoteResponse, inputPriceUsd: number): Promise<void> {
        try {
            const inputMint = quote.inputMint;
            const inAmountLamports = new Decimal(quote.inAmount); // Comes as string
            const inputDecimals = await this.getTokenDecimals(inputMint);
 
            const inAmountTokens = inAmountLamports.div(new Decimal(10).pow(inputDecimals));
            const positionValueUsd = inAmountTokens.mul(inputPriceUsd);
 
            logger.debug('Validating position size:', {
                inputMint,
                inAmountLamports: quote.inAmount,
                inputDecimals,
                inAmountTokens: inAmountTokens.toString(),
                inputPriceUsd,
                positionValueUsd: positionValueUsd.toString(),
                maxPositionSizeUsd: this.riskParams.maxPositionSizeUsd
            });
 
            if (positionValueUsd.greaterThan(this.riskParams.maxPositionSizeUsd)) {
                const details = {
                    calculatedValueUsd: positionValueUsd.toString(),
                    maxValueUsd: this.riskParams.maxPositionSizeUsd,
                    inputMint,
                    inAmount: quote.inAmount,
                    inputPriceUsd
                };
                logger.warn('Trade size exceeds maximum position size USD', details);
                throw new JupiterError(
                    JupiterErrorType.EXCEEDS_MAX_POSITION_SIZE,
                    'Calculated position size exceeds maximum allowed USD value',
                    details
                );
            }
        } catch (error) {
            if (error instanceof JupiterError) {
                throw error;
            }
            const msg = error instanceof Error ? error.message : 'Unknown error during position size validation';
            logger.error('Failed to validate position size:', { error: msg });
            throw new JupiterError(JupiterErrorType.UNKNOWN_ERROR, msg, error);
        }
    }

    public async getQuote(
        inputMint: string,
        outputMint: string,
        rawAmount: number, // Keep raw amount for internal logic
        slippageBps: number = this.riskParams.maxSlippageBps
    ): Promise<JupiterQuote | null> {
        try {
            // Apply rate limiting
            await this.checkRateLimit();
            
            // Fetch input token decimals dynamically
            const inputDecimals = await this.getTokenDecimals(inputMint);
            const amountInLamports = Math.floor(rawAmount * Math.pow(10, inputDecimals));
            
            // Record execution start time if risk manager is available
            let executionId: string | undefined;
            if (this.riskManager) {
                const tokenSymbol = await this.getTokenSymbol(outputMint) || 'unknown';
                executionId = this.riskManager.startTradeExecution(tokenSymbol);
            }
            
            let quoteResponse: QuoteResponse | null = null; // Define quoteResponse outside try
            let inputMintForValidation: string | null = null; // Declare here
            
            try {
                // Ensure the API client is initialized
                if (!this.jupiterApi) {
                    throw new JupiterError(JupiterErrorType.API_CLIENT_NOT_INITIALIZED, 'Jupiter API client is not initialized');
                }
                
                // Use the V6 quote endpoint
                quoteResponse = await this.jupiterApi.quote({
                    inputMint: inputMint, // Use string directly
                    outputMint: outputMint, // Use string directly
                    amount: amountInLamports, // Pass lamports
                    slippageBps: slippageBps, // Pass slippage
                    // onlyDirectRoutes: false, // V6 handles routing automatically
                    // swapMode: SwapMode.ExactIn // V6 infers from amount param
                });
    
                if (!quoteResponse) {
                    throw new JupiterError(
                        JupiterErrorType.NO_ROUTE_FOUND,
                        'No routes found for swap (V6 API returned null)',
                        { inputMint, outputMint, amount: amountInLamports }
                    );
                }
    
                // Need output token decimals to correctly interpret outAmount
                const outputDecimals = await this.getTokenDecimals(outputMint);
                const divisor = new Decimal(10).pow(outputDecimals);
                const outAmountDecimal = new Decimal(String(quoteResponse.outAmount)).div(divisor);
                const rawAmountDecimal = new Decimal(String(rawAmount)); // Convert number to string before creating Decimal
                const priceDecimal: Decimal = outAmountDecimal.div(rawAmountDecimal); // Then perform division
                
                // Update price in risk manager if available
                if (this.riskManager) {
                    const tokenSymbol = await this.getTokenSymbol(outputMint) || outputMint;
                    this.riskManager.updatePrice(tokenSymbol, priceDecimal.toNumber());
                }
                
                // Per-hop liquidity validation removed - V6 QuoteResponse lacks direct data per Swagger.
                // await this.validateLiquidity(quoteResponse);
    
                inputMintForValidation = quoteResponse.inputMint; // Assign here
    
                // Validate position size
                if (inputMintForValidation) { // Check if inputMint was assigned
                    // Assuming input is always SOL (or wrapped SOL) for initial purchase/swap
                    const inputMintForValidation = (inputMint === 'So11111111111111111111111111111111111111112') ? inputMint : 'So11111111111111111111111111111111111111112'; // Use native SOL for price check
                    // const inputPriceUsd = (this.riskManager) ? await this.riskManager.getCurrentPrice(inputMintForValidation) : 0;
                    const inputPriceUsd = 0; // Placeholder value
                    // const outputPriceUsd = (this.riskManager) ? await this.riskManager.getCurrentPrice(outputMint) : 0;
                    const outputPriceUsd = 0; // Placeholder value
 
                    if (inputPriceUsd > 0 && outputPriceUsd > 0) {
                        await this.validatePositionSize(quoteResponse, inputPriceUsd);
                    } else {
                        logger.warn(`Could not get price for input token ${inputMintForValidation} to validate position size.`);
                        // Decide: Throw error or allow trade without validation?
                        // For now, allowing trade but logging warning.
                    }
                } else {
                    logger.warn('Input mint not available from quote response, skipping position size validation.');
                }
                
                // Price impact check (using field from V6 response)
                // const priceImpact = quoteResponse.priceImpactPct;
                const priceImpact = 0; // Placeholder value
    
                // Construct the result matching JupiterQuote interface
                const result: JupiterQuote = {
                    originalQuote: quoteResponse, // Keep the original V6 response
                    price: priceDecimal.toString(),
                    // priceImpactPct: Number(quoteResponse.priceImpactPct), 
                    priceImpactPct: 0, // Placeholder
                    inAmount: quoteResponse.inAmount,
                    outAmount: quoteResponse.outAmount,
                    inputMint: quoteResponse.inputMint,
                    outputMint: quoteResponse.outputMint,
                    // Deprecated? Keep original response for executeSwap
                    route: quoteResponse 
                };

                // Record successful execution only if needed here (moved to executeSwap)
                // if (this.riskManager && executionId) {
                //     // What info does RiskManager need on quote success? Probably none yet.
                // }
                
                return result;

            } catch (error: any) {
                logger.error('Error fetching Jupiter V6 quote:', {
                    error: error instanceof Error ? error.message : String(error),
                    inputMint: inputMint, // Use original inputMint for error logging
                    outputMint: outputMint,
                    amount: rawAmount // Use rawAmount from function parameters
                });
                if (this.riskManager && executionId) {
                    this.riskManager.completeTradeExecution(executionId, false, error.message || 'Failed to get quote');
                }
                // Convert specific errors if needed, otherwise return null
                if (error instanceof JupiterError) {
                    throw error;
                }
                const msg = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Failed to get quote:', { error: msg });
                throw new JupiterError(JupiterErrorType.UNKNOWN_ERROR, msg, error);
            }
        } catch (error) {
            if (error instanceof JupiterError) {
                throw error;
            }
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to get quote:', { error: msg });
            // Wrap non-Jupiter errors
            throw new JupiterError(JupiterErrorType.UNKNOWN_ERROR, msg, error);
        }
    }

    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        attempt: number = 1
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= this.retryAttempts) {
                throw error;
            }

            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.warn(`Retry attempt ${attempt} of ${this.retryAttempts}`, { error: msg });

            await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
            return this.executeWithRetry(operation, attempt + 1);
        }
    }

    public async executeSwap(
        quote: JupiterQuote, // Use the result from our getQuote
        wallet: SignerWallet // Use the defined SignerWallet interface
    ): Promise<JupiterSwapResult> { // Return JupiterSwapResult
        if (!this.jupiterApi) {
            throw new JupiterError(JupiterErrorType.API_CLIENT_NOT_INITIALIZED, 'Jupiter API client is not initialized');
        }
        if (!this.connection) {
            throw new JupiterError(JupiterErrorType.CONNECTION_NOT_INITIALIZED, 'Solana connection is not initialized');
        }

        const executionId = this.riskManager?.startTradeExecution(quote.outputMint); // Track by output mint

        try {
            // Construct SwapRequest payload
            const swapRequest: SwapRequest = {
                quoteResponse: quote.originalQuote, // Pass the original V6 QuoteResponse
                userPublicKey: wallet.publicKey.toBase58(),
                wrapAndUnwrapSol: true, // Default behavior
                // feeAccount: // Optional: Provide if using platform fees
                // useSharedAccounts: // Optional: Let Jupiter decide by default
            };

            logger.debug('Sending V6 swap request:', { request: swapRequest });

            // Call the /swap endpoint
            const swapResponse = await this.jupiterApi.swapPost({ swapRequest });

            logger.debug('Received V6 swap response:', { response: swapResponse });

            // Deserialize, sign, and send the transaction(s)
            // V6 SwapResponse only contains swapTransaction
            const { swapTransaction } = swapResponse;
            const transactions = [swapTransaction].filter(Boolean) as string[]; // Array with just the swap tx string

            const signedTxs: VersionedTransaction[] = [];
            for (const txString of transactions) {
                const transaction = VersionedTransaction.deserialize(Buffer.from(txString, 'base64'));
                // Wallet needs to be compatible with VersionedTransaction
                // Assuming wallet adapter handles this (common case)
                const signedTx = await wallet.signTransaction(transaction);
                signedTxs.push(signedTx);
            }

            if (signedTxs.length === 0) {
                throw new JupiterError(JupiterErrorType.NO_TRANSACTION_RETURNED, 'No swap transactions returned from Jupiter API');
            }

            // Send transactions sequentially (only one tx in V6 base response)
            const txids: string[] = [];
            for (const signedTx of signedTxs) {
                const txid = await this.connection.sendRawTransaction(signedTx.serialize(), {
                    skipPreflight: true, // Recommended by Jupiter
                    maxRetries: 2
                });
                logger.info(`Transaction sent: ${txid}`, { type: 'swap' }); // Only swap tx
                txids.push(txid);

                // Confirm transaction (important!) - Using basic confirmation for now
                // Consider more robust confirmation logic (e.g., monitoring slot progression)
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                const confirmation = await this.connection.confirmTransaction({
                    signature: txid,
                    blockhash,
                    lastValidBlockHeight
                }, 'confirmed');
                if (confirmation.value.err) {
                    logger.error(`Transaction ${txid} confirmation failed`, { error: confirmation.value.err });
                    throw new JupiterError(JupiterErrorType.TRANSACTION_CONFIRMATION_FAILURE, `Transaction ${txid} failed to confirm`, confirmation.value.err);
                }
                logger.info(`Transaction confirmed: ${txid}`);
            }

            const result = {
                success: true,
                txId: txids.join(', '), // Combine IDs if multiple txs
                inputAmount: quote.inAmount, // Lamports string
                outputAmount: quote.outAmount, // Lamports string
                inputMint: quote.inputMint,
                outputMint: quote.outputMint,
                price: parseFloat(quote.price),
                timestamp: Date.now(),
            };

            if (executionId) { // Guard the call
                this.riskManager?.completeTradeExecution(executionId, true, undefined);
            }
            return result;

        } catch (error: any) {
            logger.error('Error executing Jupiter V6 swap:', {
                 error: error instanceof Error ? error.message : String(error),
                 quote: quote // Log the quote used for the failed swap
            });
            if (executionId) { // Guard the call
                 // Provide error message, no result on failure
                this.riskManager?.completeTradeExecution(executionId, false, error.message || 'Failed to execute swap');
            }
             // Map specific errors
             if (error instanceof JupiterError) throw error;
             // Handle potential wallet errors (e.g., user rejection)
             // Use specific error type if available from wallet adapter library
             if (error.name === 'WalletSignTransactionError' || error.message?.includes('User rejected')) { 
                throw new JupiterError(JupiterErrorType.WALLET_SIGN_REJECTED, 'User rejected transaction signing', error);
            }
            // Default error
            throw new JupiterError(JupiterErrorType.SWAP_EXECUTION_FAILED, error.message || 'Failed to execute swap', error);
        }
    }

    public async getTokenBalance(tokenMint: string): Promise<number> {
        try {
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                this.wallet.publicKey,
                { mint: new PublicKey(tokenMint) }
            );
            
            const account = tokenAccounts.value[0];
            if (!account) {
                return 0;
            }

            // Fetch decimals dynamically
            const decimals = await this.getTokenDecimals(tokenMint);
 
            // Use uiAmountString which already accounts for decimals
            const balance = new Decimal(account.account.data.parsed.info.tokenAmount.uiAmountString);
            return balance.toNumber();

            // No longer need manual decimal adjustment if using uiAmountString
            // const balance = new Decimal(account.account.data.parsed.info.tokenAmount.amount) 
            //     .div(new Decimal(10).pow(decimals));
            // return balance.toNumber();
        } catch (error) {
            // Catch specific JupiterError from getTokenDecimals
            if (error instanceof JupiterError) {
                logger.error('Failed to get token balance due to JupiterError:', { error });
                throw error; 
            }
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to get token balance:', { error: msg });
            throw new JupiterError(JupiterErrorType.UNKNOWN_ERROR, msg, error);
        }
    }
    
    // Set or update the risk manager
    public setRiskManager(riskManager: RiskManager) {
        this.riskManager = riskManager;
        logger.info('Risk manager set for Jupiter DEX');
    }
}
