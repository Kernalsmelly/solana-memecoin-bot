"use strict";
// tradingEngine.ts
// Recreated from scratch to remove any hidden/encoding chars. See tradingEngine.bak.ts for original reference.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingEngine = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("../utils/logger"));
const notifications_1 = require("../utils/notifications");
const tradeLogger_1 = require("../utils/tradeLogger");
const discordNotifier_1 = require("../utils/discordNotifier");
const signalLogger_1 = require("../utils/signalLogger");
class TradingEngine {
    riskManager;
    parameterFeedbackLoop;
    volatilitySqueeze;
    connection;
    // ... other properties ...
    getPositions() {
        return Array.from(this.currentPositions.values());
    }
    // ... other methods ...
    checkSellCriteria(marketData) {
        logger_1.default.debug(`[TradingEngine] Checking SELL criteria for ${marketData.mint}...`);
        const positionInfo = this.currentPositions.get(marketData.mint);
        if (!positionInfo) {
            logger_1.default.warn(`[TradingEngine] checkSellCriteria called for ${marketData.mint} but no position info found.`);
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
        let actualProfitPercent = undefined;
        if (entryPrice > 0) {
            actualProfitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            if (stopLossPercent !== undefined || takeProfitPercent !== undefined) {
                logger_1.default.debug(`[TradingEngine] P/L Check for ${mint}: Entry=${entryPrice.toFixed(6)}, Current=${currentPrice.toFixed(6)}, P/L=${actualProfitPercent.toFixed(2)}%`);
            }
            if (stopLossPercent !== undefined && actualProfitPercent <= stopLossPercent) {
                shouldSell = true;
                reason = `Stop Loss triggered (${actualProfitPercent.toFixed(2)}% <= ${stopLossPercent}%)`;
            }
            else if (takeProfitPercent !== undefined && actualProfitPercent >= takeProfitPercent) {
                shouldSell = true;
                reason = `Take Profit triggered (${actualProfitPercent.toFixed(2)}% >= ${takeProfitPercent}%)`;
            }
        }
        else if (stopLossPercent !== undefined || takeProfitPercent !== undefined) {
            logger_1.default.warn(`[TradingEngine] Entry price for ${mint} is zero or invalid (${entryPrice}), cannot calculate P/L for SL/TP.`);
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
    async sendAndConfirmTransaction(transaction, description, tokenMint) {
        const priorityFeeMicroLamports = this.config.trading?.txPriorityFeeMicroLamports;
        const confirmationTimeoutMs = this.config.trading?.txConfirmationTimeoutMs;
        try {
            const instructions = [];
            if (priorityFeeMicroLamports && priorityFeeMicroLamports > 0) {
                instructions.push(web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));
                logger_1.default.debug(`[TradingEngine] Adding priority fee: ${priorityFeeMicroLamports} micro-lamports for ${description} ${tokenMint}`);
            }
            let finalTransaction = transaction;
            if (instructions.length > 0) {
                const message = web3_js_1.TransactionMessage.decompile(transaction.message, {
                    addressLookupTableAccounts: []
                });
                message.instructions.unshift(...instructions);
                finalTransaction = new web3_js_1.VersionedTransaction(message.compileToLegacyMessage());
                finalTransaction.sign([this.wallet]);
                logger_1.default.debug(`[TradingEngine] Recompiled and re-signed ${description} tx for ${tokenMint} with priority fee.`);
            }
            const txid = await this.connection.sendTransaction(finalTransaction, {
                skipPreflight: true,
                maxRetries: 2,
            });
            logger_1.default.info(`[TradingEngine] ${description} transaction sent for ${tokenMint}. TXID: ${txid}. Waiting for confirmation...`);
            const confirmationStrategy = {
                signature: txid,
                blockhash: finalTransaction.message.recentBlockhash,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight
            };
            const result = await this.connection.confirmTransaction(confirmationStrategy, 'confirmed');
            if (result.value.err) {
                logger_1.default.error(`[TradingEngine] ${description} transaction confirmation failed for ${tokenMint}. TXID: ${txid}. Error: ${JSON.stringify(result.value.err)}`);
                return null;
            }
            logger_1.default.info(`[TradingEngine] ${description} transaction confirmed successfully! TXID: ${txid}`);
            return txid;
        }
        catch (error) {
            logger_1.default.error(`[TradingEngine] Error during ${description} transaction sending/confirmation for ${tokenMint}: ${error.message}`, { txid: error.txid });
            tradeLogger_1.tradeLogger.logScenario('TX_ERROR', {
                description,
                tokenMint,
                error: error.message,
                txid: error.txid,
                timestamp: new Date().toISOString()
            });
            await (0, notifications_1.sendAlert)(`[TradingEngine] Error during ${description} transaction for ${tokenMint}: ${error.message}`, 'CRITICAL');
            if (error.logs) {
                logger_1.default.error(`[TradingEngine] Transaction Logs: ${error.logs.join('\n')}`);
            }
        }
        return null;
    }
    /**
     * Executes a buy order for a specified token.
     */
    async buyToken(outputMint, pairAddress, marketData) {
        let positionSizeSol = 0.1;
        try {
            const balanceLamports = await this.connection.getBalance(this.wallet.publicKey);
            const balanceSol = balanceLamports / 1e9;
            const tokenSymbol = marketData?.symbol || outputMint.toString();
            positionSizeSol = this.riskManager.getDynamicPositionSizeSol(tokenSymbol, balanceSol, this.config.trading?.riskPct ?? 0.01, this.config.trading?.maxPositionSize ?? 1);
            logger_1.default.info(`[RiskManager] Computed position size for ${tokenSymbol}: ${positionSizeSol} SOL (Wallet balance: ${balanceSol} SOL)`);
        }
        catch (err) {
            logger_1.default.warn(`[RiskManager] Failed to compute dynamic position size: ${err}`);
        }
        if (this.config.signalOnlyMode) {
            const payload = {
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
            await (0, discordNotifier_1.sendDiscordSignal)(payload);
            (0, signalLogger_1.logSignal)(payload);
            logger_1.default.info(`[TradingEngine] Signal-only mode: Sent BUY signal for ${outputMint.toString()}`);
            return true;
        }
        try {
            logger_1.default.info(`[TradingEngine] [PROFIT CHECK] Entry conditions logged for ${outputMint.toString()}`);
            return true;
        }
        catch (error) {
            logger_1.default.error(`[TradingEngine] BUY operation failed for ${outputMint.toString()}: ${error.message}`);
            tradeLogger_1.tradeLogger.logScenario('BUY_FAILED', {
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
    async sellToken(tokenMint, pairAddress, marketData) {
        if (this.config.signalOnlyMode) {
            const payload = {
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
            await (0, discordNotifier_1.sendDiscordSignal)(payload);
            (0, signalLogger_1.logSignal)(payload);
            logger_1.default.info(`[TradingEngine] Signal-only mode: Sent SELL signal for ${tokenMint.toString()}`);
            return true;
        }
        try {
            logger_1.default.info(`[TradingEngine] [PROFIT CHECK] Sell conditions logged for ${tokenMint.toString()}`);
            return true;
        }
        catch (error) {
            logger_1.default.error(`[TradingEngine] SELL operation failed for ${tokenMint.toString()}: ${error.message}`);
            return false;
        }
    }
}
exports.TradingEngine = TradingEngine;
//# sourceMappingURL=tradingEngine.js.map