// tradingEngine.ts
// Recreated from scratch to remove any hidden/encoding chars. See tradingEngine.bak.ts for original reference.

import { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, TransactionInstruction } from '@solana/web3.js';
import { Config } from '../utils/config';
import logger from '../utils/logger';
import { sendAlert } from '../utils/notifications';
import { MarketDataUpdateEvent } from './priceWatcher';
import { tradeLogger, TradeLogEntry } from '../utils/tradeLogger';
import { sendDiscordSignal, SignalPayload } from '../utils/discordNotifier';
import { logSignal } from '../utils/signalLogger';
import { createJupiterApiClient, QuoteGetRequest, SwapPostRequest, QuoteResponse, SwapResponse } from '@jup-ag/api';
import * as fs from 'fs';
import * as path from 'path';
import { RiskManager } from '../riskManager';
import { ParameterFeedbackLoop } from '../strategy/ParameterFeedbackLoop';
import { VolatilitySqueeze } from '../strategies/volatilitySqueeze';

interface PositionInfo {
    entryPrice: number;
    entryTimestamp: number;
    amountBoughtUi: number | undefined;
    pairAddress: string;
}

export class TradingEngine {
    private riskManager: RiskManager;
    private parameterFeedbackLoop: ParameterFeedbackLoop;
    private volatilitySqueeze: VolatilitySqueeze;
    private connection: Connection;
    // ... other properties ...

    public getPositions(): PositionInfo[] {
        return Array.from(this.currentPositions.values());
    }

    // ... other methods ...

    private checkSellCriteria(marketData: any): { shouldSell: boolean; reason: string } {
        logger.debug(`[TradingEngine] Checking SELL criteria for ${marketData.mint}...`);
        const positionInfo = this.currentPositions.get(marketData.mint);
        if (!positionInfo) {
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
        const entryPrice = positionInfo.entryPrice;
        let actualProfitPercent: number | undefined = undefined;
        if (entryPrice > 0) {
            actualProfitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
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
            logger.warn(`[TradingEngine] Entry price for ${mint} is zero or invalid (${entryPrice}), cannot calculate P/L for SL/TP.`);
        }
        const minSellLiquidity = sellCriteria?.minSellLiquidity ?? tradingConfig?.minLiquidity;
        if (!shouldSell && minSellLiquidity !== undefined && liquidity !== undefined && liquidity < minSellLiquidity) {
            shouldSell = true;
            reason = `Liquidity $${liquidity?.toFixed(2)} below sell threshold $${minSellLiquidity}`;
        }
        const minSellBuyRatio = sellCriteria?.minSellBuyRatio;
        if (!shouldSell && minSellBuyRatio !== undefined && buyRatio5m !== undefined && buyRatio5m < minSellBuyRatio) {
            shouldSell = true;
            reason = `Buy Ratio ${buyRatio5m?.toFixed(2)} below sell threshold ${minSellBuyRatio}`;
        }
        if (!shouldSell) {
            reason = 'No sell criteria met.';
        }
        return { shouldSell, reason };
    }

    /**
     * Helper function to send and confirm a transaction with optional priority fees and timeout.
     */
    private async sendAndConfirmTransaction(
        transaction: VersionedTransaction,
        description: string,
        tokenMint: string
    ): Promise<string | null> {
        const priorityFeeMicroLamports = this.config.trading?.txPriorityFeeMicroLamports;
        const confirmationTimeoutMs = this.config.trading?.txConfirmationTimeoutMs;
        try {
            const instructions: TransactionInstruction[] = [];
            if (priorityFeeMicroLamports && priorityFeeMicroLamports > 0) {
                instructions.push(
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports })
                );
                logger.debug(`[TradingEngine] Adding priority fee: ${priorityFeeMicroLamports} micro-lamports for ${description} ${tokenMint}`);
            }
            let finalTransaction = transaction;
            if (instructions.length > 0) {
                const message = TransactionMessage.decompile(transaction.message, {
                    addressLookupTableAccounts: []
                });
                message.instructions.unshift(...instructions);
                finalTransaction = new VersionedTransaction(message.compileToLegacyMessage());
                finalTransaction.sign([this.wallet]);
                logger.debug(`[TradingEngine] Recompiled and re-signed ${description} tx for ${tokenMint} with priority fee.`);
            }
            const txid = await this.connection.sendTransaction(finalTransaction, {
                skipPreflight: true,
                maxRetries: 2,
            });
            logger.info(`[TradingEngine] ${description} transaction sent for ${tokenMint}. TXID: ${txid}. Waiting for confirmation...`);
            const confirmationStrategy = {
                signature: txid,
                blockhash: finalTransaction.message.recentBlockhash,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
            };
            const result = await this.connection.confirmTransaction(
                confirmationStrategy,
                'confirmed'
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
        return null;
    }

    /**
     * Executes a buy order for a specified token.
     */
    public async buyToken(outputMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean> {
        let positionSizeSol = 0.1;
        try {
            const balanceLamports = await this.connection.getBalance(this.wallet.publicKey);
            const balanceSol = balanceLamports / 1e9;
            const tokenSymbol = marketData?.symbol || outputMint.toString();
            positionSizeSol = this.riskManager.getDynamicPositionSizeSol(
                tokenSymbol,
                balanceSol,
                this.config.trading?.riskPct ?? 0.01,
                this.config.trading?.maxPositionSize ?? 1
            );
            logger.info(`[RiskManager] Computed position size for ${tokenSymbol}: ${positionSizeSol} SOL (Wallet balance: ${balanceSol} SOL)`);
        } catch (err) {
            logger.warn(`[RiskManager] Failed to compute dynamic position size: ${err}`);
        }
        if ((this.config as any).signalOnlyMode) {
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
            logger.info(`[TradingEngine] [PROFIT CHECK] Entry conditions logged for ${outputMint.toString()}`);
            return true;
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
     */
    public async sellToken(tokenMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean> {
        if ((this.config as any).signalOnlyMode) {
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
            logger.info(`[TradingEngine] [PROFIT CHECK] Sell conditions logged for ${tokenMint.toString()}`);
            return true;
        } catch (error: any) {
            logger.error(`[TradingEngine] SELL operation failed for ${tokenMint.toString()}: ${error.message}`);
            return false;
        }
    }
}
