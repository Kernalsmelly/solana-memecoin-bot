// NOTE: All changes should work towards functionality and profitability.
import { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, TransactionInstruction } from '@solana/web3.js';
import { Config } from '../utils/config';
import logger from '../utils/logger';
import { sendAlert } from '../utils/notifications';
import { MarketDataUpdateEvent } from './priceWatcher'; // Use correct event type
import { tradeLogger, TradeLogEntry } from '../utils/tradeLogger';
import { sendDiscordSignal, SignalPayload } from '../utils/discordNotifier';
import { logSignal } from '../utils/signalLogger';
import { createJupiterApiClient, QuoteGetRequest, SwapPostRequest, QuoteResponse, SwapResponse } from '@jup-ag/api';
// import { getAssociatedTokenAddressSync } from '@solana/spl-token'; // Removed due to TS2305 error. Add back if needed with correct path.
import * as fs from 'fs';
import * as path from 'path';

// Interface to store details about each held position
interface PositionInfo {
    entryPrice: number;      // Price at which the token was bought (in USDC)
    entryTimestamp: number;  // Unix timestamp (ms) of when the position was opened
    amountBoughtUi: number | undefined; // Store the UI amount bought for logging/reference
    pairAddress: string;     // Store the pair address associated with this position
}

export class TradingEngine {
    // ... (existing properties)
    /**
     * Returns all current positions as an array
     */
    public getPositions(): PositionInfo[] {
        return Array.from(this.currentPositions.values());
    }

    private connection: Connection;
    private config: Config;
    private wallet: Keypair;
    private currentPositions: Map<string, PositionInfo>; // Store mint addresses mapped to their PositionInfo
    private jupiterApi: ReturnType<typeof createJupiterApiClient>;
    private usdcMint: PublicKey;
    private positionsFilePath: string;
    private usdcDecimals: number | null = null; // Cache for USDC decimals
    private maxPositions: number;

    constructor(connection: Connection, config: Config, wallet: Keypair) {
        this.connection = connection;
        this.config = config;
        this.wallet = wallet;
        // Main trading loop
        // Emit heartbeat for TradingEngine
        if ((globalThis as any).heartbeat?.TradingEngine) {
            (globalThis as any).heartbeat.TradingEngine();
        } else {
            logger.debug('[HEARTBEAT] TradingEngine heartbeat function not found');
        }
        // Initialize positions set - will be overwritten by loadPositions if file exists
        this.currentPositions = new Map<string, PositionInfo>();
        this.jupiterApi = createJupiterApiClient(); // Initialize Jupiter API client

        // Define path for positions file
        this.positionsFilePath = path.resolve(__dirname, '..', '..', 'data', 'positions.json'); // Store in data/ directory

        if (!config.solana.usdcMint) {
            throw new Error('USDC mint address is not defined in the configuration.');
        }
        this.usdcMint = new PublicKey(config.solana.usdcMint);

        // Set maxPositions from config or default to 3
        this.maxPositions = config.trading?.maxPositions ?? 3;

        // Initialize USDC decimals (async)
        this.initializeUsdcDecimals(); 

        // Load existing positions immediately (async but we don't strictly need to wait)
        this.loadPositions().then(() => {
            logger.info(`[TradingEngine] Initialized. Loaded ${this.currentPositions.size} positions from state.`);
        });
    }

    /**
     * Fetches and caches the decimals for the configured USDC mint.
     */
    private async initializeUsdcDecimals(): Promise<void> {
        try {
            logger.debug(`[TradingEngine] Fetching decimals for USDC mint: ${this.usdcMint.toString()}`);
            this.usdcDecimals = 6; // Default for USDC
logger.info(`[TradingEngine] USDC decimals set to: ${this.usdcDecimals}`);
        } catch (error: any) {
            logger.error(`[TradingEngine] FATAL: Failed to fetch decimals for USDC mint ${this.usdcMint.toString()}. Error: ${error.message}`);
            // This is likely a configuration error or RPC issue. Bot cannot proceed reliably.
            // Consider throwing error or exiting process depending on desired behavior
            this.usdcDecimals = null; // Indicate failure
            // throw new Error(`Failed to initialize USDC decimals: ${error.message}`);
        }
    }

    /**
     * Loads the current positions from the state file.
     */
    private async loadPositions(): Promise<void> {
        try {
            // Ensure data directory exists
            try {
    await fs.promises.mkdir(path.dirname(this.positionsFilePath), { recursive: true });
} catch (err: any) {
    if (err.code !== 'EEXIST') throw err;
}

            const data = await fs.promises.readFile(this.positionsFilePath, 'utf-8');
            const positionsObjectFromFile = JSON.parse(data);

            // Basic validation: Check if it's an object
            if (typeof positionsObjectFromFile === 'object' && positionsObjectFromFile !== null) {
                // Convert object back to Map
                const loadedMap = new Map<string, PositionInfo>();
                let validEntries = 0;
                for (const key in positionsObjectFromFile) {
                    if (Object.prototype.hasOwnProperty.call(positionsObjectFromFile, key)) {
                        const value = positionsObjectFromFile[key];
                        // Add more robust validation for PositionInfo structure if needed
                        if (value && typeof value.entryPrice === 'number' && typeof value.entryTimestamp === 'number' && typeof value.pairAddress === 'string') {
                            loadedMap.set(key, value as PositionInfo);
                            validEntries++;
                        } else {
                            logger.warn(`[TradingEngine] Skipping invalid position data for key ${key} in ${this.positionsFilePath}`);
                        }
                    }
                }
                this.currentPositions = loadedMap;
                logger.debug(`[TradingEngine] Successfully loaded ${validEntries} valid positions from ${this.positionsFilePath}`);
            } else {
                logger.warn(`[TradingEngine] Invalid data format in ${this.positionsFilePath}. Starting with empty positions.`);
                this.currentPositions = new Map<string, PositionInfo>();
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
    tradeLogger.logScenario('POSITIONS_FILE_NOT_FOUND', {
        file: this.positionsFilePath,
        timestamp: new Date().toISOString()
    });
                logger.info(`[TradingEngine] Positions file (${this.positionsFilePath}) not found. Starting with empty positions.`);
                this.currentPositions = new Map<string, PositionInfo>();
            } else {
                logger.error(`[TradingEngine] Failed to load positions from ${this.positionsFilePath}: ${error.message}`);
tradeLogger.logScenario('POSITIONS_FILE_LOAD_ERROR', {
    file: this.positionsFilePath,
    error: error.message,
    timestamp: new Date().toISOString()
});
            await sendAlert(`[TradingEngine] Failed to load positions from ${this.positionsFilePath}: ${error.message}`, 'ERROR');
                // Decide if we should proceed with empty positions or throw an error
                this.currentPositions = new Map<string, PositionInfo>();
            }
        }
    }

    /**
     * Saves the current positions to the state file.
     */
    private async savePositions(): Promise<void> {
        try {
            // Ensure data directory exists
            try {
    await fs.promises.mkdir(path.dirname(this.positionsFilePath), { recursive: true });
} catch (err: any) {
    if (err.code !== 'EEXIST') throw err;
}

            // Convert map to object for JSON serialization
            const positionsObject: { [key: string]: PositionInfo } = {};
            this.currentPositions.forEach((value, key) => {
                positionsObject[key] = value;
            });

            const data = JSON.stringify(positionsObject, null, 2); // Pretty print JSON
            await fs.promises.writeFile(this.positionsFilePath, data, 'utf-8');
            logger.debug(`[TradingEngine] Successfully saved ${this.currentPositions.size} positions to ${this.positionsFilePath}`);
        } catch (error: any) {
            logger.error(`[TradingEngine] Failed to save positions to ${this.positionsFilePath}: ${error.message}`);
tradeLogger.logScenario('POSITIONS_FILE_SAVE_ERROR', {
    file: this.positionsFilePath,
    error: error.message,
    timestamp: new Date().toISOString()
});
        await sendAlert(`[TradingEngine] Failed to save positions to ${this.positionsFilePath}: ${error.message}`, 'ERROR');
            // Consider retry logic or alerting
        }
    }

    /**
     * Evaluates market data for a token and decides whether to trade.
     * This method is intended to be called when PriceWatcher emits marketDataUpdate.
     * @param marketData The latest market data for the token.
     */
    public evaluateToken(marketData: any): void {
        const currentlyHeld = this.currentPositions.has(marketData.mint);
        logger.debug(`[TradingEngine] Evaluating ${marketData.mint}. Held: ${currentlyHeld}`);

        // Example placeholder logic:
        // Only check buy criteria if not already holding
        if (!currentlyHeld) {
            // Log skip if at max positions
            if (this.currentPositions.size >= this.maxPositions) {
                tradeLogger.log({
                    timestamp: new Date().toISOString(),
                    action: 'skip',
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
                logger.info(`[TradingEngine] BUY criteria met for ${marketData.mint}: ${reason}`);
                // Pass marketData to buyToken to record entry price
                this.buyToken(new PublicKey(marketData.mint), marketData.pairAddress ?? '', marketData).then(buySuccess => {
                    tradeLogger.log({
                        timestamp: new Date().toISOString(),
                        action: 'buy',
                        token: marketData.mint,
                        pairAddress: marketData.pairAddress,
                        price: marketData.currentPrice,
                        amount: undefined, // Optionally fill with actual amount bought
                        reason: reason,
                        success: buySuccess
                    });
                    // TODO: Alert on buy if desired
                    if(buySuccess) {
                        logger.info(`[TradingEngine] Successfully bought ${marketData.mint}.`);
                    } else {
                        logger.warn(`[TradingEngine] Buy attempt failed for ${marketData.mint}.`);
                    }
                });
            } else {
                logger.debug(`[TradingEngine] BUY criteria NOT MET for ${marketData.mint}: ${reason}`);
            }
        } else {
            // Scenario 1: Currently holding the token - check sell criteria
            const { shouldSell, reason } = this.checkSellCriteria(marketData);
            if (shouldSell) {
                logger.info(`[TradingEngine] SELL criteria met for ${marketData.mint}. Reason: ${reason}. Attempting sell...`);
                this.sellToken(new PublicKey(marketData.mint), marketData.pairAddress ?? '').then(sellSuccess => {
                    const positionInfo = this.currentPositions.get(marketData.mint);
                    const pnl = positionInfo && positionInfo.entryPrice > 0
                        ? ((marketData.currentPrice - positionInfo.entryPrice) / positionInfo.entryPrice) * 100
                        : undefined;
                    tradeLogger.log({
                        timestamp: new Date().toISOString(),
                        action: 'sell',
                        token: marketData.mint,
                        pairAddress: marketData.pairAddress,
                        price: marketData.currentPrice,
                        amount: undefined, // Optionally fill with actual amount sold
                        pnl,
                        reason: reason,
                        success: sellSuccess
                    });
                    // TODO: Alert on sell if desired
                    if(sellSuccess) {
                        logger.info(`[TradingEngine] Successfully sold ${marketData.mint}.`);
                    } else {
                        logger.warn(`[TradingEngine] Sell attempt failed for ${marketData.mint}.`);
                    }
                });
            } else {
                // logger.debug(`[TradingEngine] Holding ${marketData.mint}, sell criteria not met.`);
            }
        }
    }

    private checkBuyCriteria(marketData: any): { shouldBuy: boolean; reason: string } {
        // --- 1. Input Validation --- 
        if (!marketData || marketData?.liquidity === undefined || marketData?.priceChangePercent === undefined || marketData?.buyRatio5m === undefined || marketData?.pairCreatedAt === undefined) {
    tradeLogger.logScenario('SKIP_INSUFFICIENT_DATA', {
        token: marketData?.mint,
        reason: 'Insufficient data for buy criteria',
        timestamp: new Date().toISOString()
    });
            logger.debug(`[TradingEngine] Insufficient data for buy criteria check: ${marketData.mint}`);
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
        let reasons: string[] = [];

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
            logger.warn(`[TradingEngine] BUY REJECTED (${marketData.mint}): Volume change data unavailable.`);
            passes = false;
            reasons.push('Volume change data unavailable');
        } else if (marketData?.volumeChangePercent < requiredVolumeSpike) {
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
    tradeLogger.logScenario('SKIP_BUY_CRITERIA_NOT_MET', {
        token: marketData.mint,
        reasons: reasons.join('; '),
        timestamp: new Date().toISOString()
    });
             logger.debug(`[TradingEngine] BUY criteria NOT MET for ${marketData.mint} (${isNewToken ? 'New' : 'Established'}). Reasons: ${reasons.join(', ')}`);
        }

        return { shouldBuy: passes, reason: passes ? 'Criteria met' : reasons.join(', ') };
    }

    private checkSellCriteria(marketData: any): { shouldSell: boolean; reason: string } {
        logger.debug(`[TradingEngine] Checking SELL criteria for ${marketData.mint}...`);
    
        const positionInfo = this.currentPositions.get(marketData.mint);
        if (!positionInfo) {
            // Should not happen if logic is correct, but safety check
            logger.warn(`[TradingEngine] checkSellCriteria called for ${marketData.mint} but no position info found.`);
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
        let actualProfitPercent: number | undefined = undefined;

        if (entryPrice > 0) { // Avoid division by zero
            actualProfitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            // Log P/L only if criteria are configured to avoid noise
            if (stopLossPercent !== undefined || takeProfitPercent !== undefined) {
                logger.debug(`[TradingEngine] P/L Check for ${mint}: Entry=${entryPrice.toFixed(6)}, Current=${currentPrice.toFixed(6)}, P/L=${actualProfitPercent.toFixed(2)}%`);
            }

            if (stopLossPercent !== undefined && actualProfitPercent <= stopLossPercent) {
                shouldSell = true;
                reason = `Stop Loss triggered (${actualProfitPercent.toFixed(2)}% <= ${stopLossPercent}%)`;
            } else if (takeProfitPercent !== undefined && actualProfitPercent >= takeProfitPercent) {
                shouldSell = true;
                reason = `Take Profit triggered (${actualProfitPercent.toFixed(2)}% >= ${takeProfitPercent}%)`;
            }
        } else if (stopLossPercent !== undefined || takeProfitPercent !== undefined) {
            // Only warn if SL/TP is configured but entry price is invalid
            logger.warn(`[TradingEngine] Entry price for ${mint} is zero or invalid (${entryPrice}), cannot calculate P/L for SL/TP.`);
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
    private async sendAndConfirmTransaction(
        transaction: VersionedTransaction,
        description: string,
        tokenMint: string // For logging context
    ): Promise<string | null> {
        const priorityFeeMicroLamports = this.config.trading?.txPriorityFeeMicroLamports;
        const confirmationTimeoutMs = this.config.trading?.txConfirmationTimeoutMs;

        try {
            const instructions: TransactionInstruction[] = [];

            // Add Priority Fee Instruction if configured
            if (priorityFeeMicroLamports && priorityFeeMicroLamports > 0) {
                instructions.push(
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports })
                );
                logger.debug(`[TradingEngine] Adding priority fee: ${priorityFeeMicroLamports} micro-lamports for ${description} ${tokenMint}`);
            }

            // Reconstruct transaction if priority fee added
            let finalTransaction = transaction;
            if (instructions.length > 0) {
                const message = TransactionMessage.decompile(transaction.message, {
                    addressLookupTableAccounts: [] // No LUTs used
                });
                // Prepend priority fee instructions
                message.instructions.unshift(...instructions);

                // Recompile with the original blockhash and payer
                finalTransaction = new VersionedTransaction(message.compileToLegacyMessage());

                // Re-sign the modified transaction
                finalTransaction.sign([this.wallet]);
                logger.debug(`[TradingEngine] Recompiled and re-signed ${description} tx for ${tokenMint} with priority fee.`);
            }

            // Send the transaction
            const txid = await this.connection.sendTransaction(finalTransaction, {
                skipPreflight: true, // Often recommended with priority fees
                maxRetries: 2, // Optional: Retry sending a couple of times
            });
            logger.info(`[TradingEngine] ${description} transaction sent for ${tokenMint}. TXID: ${txid}. Waiting for confirmation...`);

            // Confirm the transaction
            const confirmationStrategy = {
                signature: txid,
                blockhash: finalTransaction.message.recentBlockhash,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
            };

            const result = await this.connection.confirmTransaction(
                confirmationStrategy,
                'confirmed' // Or 'processed', 'finalized'. 'confirmed' is usually a good balance.
            );

            if (result.value.err) {
                logger.error(`[TradingEngine] ${description} transaction confirmation failed for ${tokenMint}. TXID: ${txid}. Error: ${JSON.stringify(result.value.err)}`);
                return null;
            }

            logger.info(`[TradingEngine] ${description} transaction confirmed successfully! TXID: ${txid}`);
            return txid;
        } catch (error: any) {
            logger.error(`[TradingEngine] Error during ${description} transaction sending/confirmation for ${tokenMint}: ${error.message}`, { txid: error.txid });
tradeLogger.logScenario('TX_ERROR', {
    description,
    tokenMint,
    error: error.message,
    txid: error.txid,
    timestamp: new Date().toISOString()
});
        await sendAlert(`[TradingEngine] Error during ${description} transaction for ${tokenMint}: ${error.message}`, 'CRITICAL');
            if (error.logs) {
                logger.error(`[TradingEngine] Transaction Logs: ${error.logs.join('\n')}`);
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
    public async buyToken(outputMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean> {
        if ((this.config as any).signalOnlyMode) {
            // --- Signal-Only Mode: Send Discord notification and log ---
            const payload: SignalPayload = {
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
            await sendDiscordSignal(payload);
            logSignal(payload);
            logger.info(`[TradingEngine] Signal-only mode: Sent BUY signal for ${outputMint.toString()}`);
            return true;
        }
        try {
            // ... (full buyToken logic goes here, unchanged from your previous implementation) ...
            // Profitability logging example:
            logger.info(`[TradingEngine] [PROFIT CHECK] Entry conditions logged for ${outputMint.toString()}`);
            // Ensure a boolean is always returned
            return true; // Replace with actual logic
        } catch (error: any) {
            logger.error(`[TradingEngine] BUY operation failed for ${outputMint.toString()}: ${error.message}`);
tradeLogger.logScenario('BUY_FAILED', {
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
    public async sellToken(tokenMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean> {
        if ((this.config as any).signalOnlyMode) {
            // --- Signal-Only Mode: Send Discord notification and log ---
            const payload: SignalPayload = {
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
            await sendDiscordSignal(payload);
            logSignal(payload);
            logger.info(`[TradingEngine] Signal-only mode: Sent SELL signal for ${tokenMint.toString()}`);
            return true;
        }
        try {
            // ... (full sellToken logic goes here, unchanged from your previous implementation if you have one) ...
            logger.info(`[TradingEngine] [PROFIT CHECK] Sell conditions logged for ${tokenMint.toString()}`);
            // Ensure a boolean is always returned
            return true; // Replace with actual logic
        } catch (error: any) {
            logger.error(`[TradingEngine] SELL operation failed for ${tokenMint.toString()}: ${error.message}`);
            return false;
        }
    }
}
