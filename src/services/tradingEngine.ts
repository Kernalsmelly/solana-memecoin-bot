// tradingEngine.ts
import { Connection, PublicKey, VersionedTransaction, Keypair } from '@solana/web3.js';
import { Config } from '../utils/config.js';
import logger from '../utils/logger.js';
import { sendAlert } from '../utils/notifications.js';
import { MarketDataUpdateEvent } from './priceWatcher.js';
import { tradeLogger, TradeLogEntry } from '../utils/tradeLogger.js';
import { sendDiscordSignal, SignalPayload } from '../utils/discordNotifier.js';
import { logSignal } from '../utils/signalLogger.js';
import {
  createJupiterApiClient,
  QuoteGetRequest,
  SwapPostRequest,
  QuoteResponse,
  SwapResponse,
} from '@jup-ag/api';
import { StrategyCoordinator } from '../strategies/strategyCoordinator.js';
import { VolatilitySqueeze } from '../strategies/volatilitySqueeze.js';
import MomentumBreakoutStrategy from '../strategies/momentumBreakout.js';
import {
  ParameterFeedbackLoop,
  FeedbackTrade,
  FeedbackParams,
  FeedbackStats,
} from '../strategies/parameterFeedbackLoop.js';
import { RiskManager } from '../live/riskManager.js';
import { TxnBuilder } from './txnBuilder.js';

interface PositionInfo {
  entryPrice: number;
  entryTimestamp: number;
  amountBoughtUi: number | undefined;
  pairAddress: string;
}

export type SendAlertFn = (msg: string, level?: string) => Promise<boolean>;

export class TradingEngine {
  private riskManager: RiskManager;
  private strategyCoordinator: StrategyCoordinator;
  private volatilitySqueeze: VolatilitySqueeze | undefined = undefined;
  private altStrategy: MomentumBreakoutStrategy;
  private feedbackLoop: ParameterFeedbackLoop;
  private feedbackBatchSize: number;
  private feedbackDeltaPct: number;
  private maxDrawdownPercent: number;
  private drawdownAlertPct: number;
  private txnBuilder: TxnBuilder;
  private consecutiveLosses: number = 0;
  private enableAlternativeStrategy: boolean = false;
  public currentPositions: Map<string, PositionInfo> = new Map();

  public get positions() {
    return this.currentPositions;
  }

  public set positions(val: Map<string, PositionInfo>) {
    this.currentPositions = val;
  }

  constructor(
    private connection: Connection,
    private config: Config,
    private wallet: Keypair,
    private keyRotationManager?: import('../utils/keyRotationManager.js').KeyRotationManager,
    sendAlertFn?: SendAlertFn,
  ) {
    this.sendAlertFn = sendAlertFn || sendAlert;

    // Initialize core components
    this.riskManager = new RiskManager({
      maxDrawdown: 0.2,
      maxDailyLoss: 0.1,
      maxPositions: 5,
      maxPositionSize: 1000,
    });
    this.strategyCoordinator = new StrategyCoordinator({
      strategies: [],
      cooldownSec: 60,
    }); // Valid CoordinatorOptions
    this.altStrategy = new MomentumBreakoutStrategy({
      cooldownSec: 300,
      maxHistory: 120,
      momentumThreshold: 1.0,
    });
    this.feedbackLoop = new ParameterFeedbackLoop(
      { priceChangeThreshold: 20, volumeMultiplier: 2 },
      (params, stats) => {},
      10,
      0.05,
    );
    this.feedbackBatchSize = 10;
    this.feedbackDeltaPct = 0.05;
    this.maxDrawdownPercent = 20;
    this.drawdownAlertPct = 10;
    this.txnBuilder = new TxnBuilder(connection, {
      priorityFee: 0,
      maxRetries: 3,
      retryDelayMs: 1000,
    });
  }

  public getWalletPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  public getConsecutiveLosses(): number {
    return this.consecutiveLosses;
  }

  public async checkLossAlert(drawdown: number, threshold: number): Promise<void> {
    if (this.consecutiveLosses >= 3) {
      await this.sendAlertFn('3 consecutive losses', 'CRITICAL');
      this.consecutiveLosses = 0;
    }
    if (drawdown <= -threshold) {
      await this.sendAlertFn('Drawdown Breach', 'CRITICAL');
    }
  }

  private async calculatePositionSize(price: number, marketData: any): Promise<number> {
    try {
      const balanceLamports = await this.connection.getBalance(this.wallet.publicKey);
      const balanceSol = balanceLamports / 1e9;
      const rawSymbol = marketData?.symbol || '';
      const symbolKey = String(rawSymbol).toUpperCase();

      let positionSizeSol = await (this.riskManager as any).calculatePositionSize(
        symbolKey,
        price,
        balanceSol,
        this.config.trading && 'riskPct' in this.config.trading
          ? this.config.trading.riskPct
          : 0.01,
        this.config.trading && 'maxPositionSize' in this.config.trading
          ? this.config.trading.maxPositionSize
          : 1,
      );

      if (process.argv.includes('--force-trade')) {
        positionSizeSol = 0.03;
      }

      return positionSizeSol;
    } catch (err) {
      logger.warn('[RiskManager] Failed to compute dynamic position size: ' + err);
      return 0.1; // Fallback position size
    }
  }

  private async handleSignalMode(
    token: string,
    symbolKey: string,
    pairAddress: string,
    marketData: any,
  ): Promise<boolean> {
    if ((this.config as any).signalOnlyMode) {
      const payload: SignalPayload = {
        type: 'BUY_SIGNAL',
        token: {
          mint: token,
          symbol: symbolKey,
          poolAddress: pairAddress,
        },
        price: marketData?.currentPrice ?? 0,
        liquidity: marketData?.liquidity ?? 0,
        volume: marketData?.volume1h ?? 0,
        buyRatio: marketData?.buyRatio5m ?? 0,
        reason: marketData?.signalReason || 'Criteria met',
        links: {
          solscan: 'https://solscan.io/token/' + token,
          raydium: pairAddress
            ? 'https://raydium.io/swap/?inputCurrency=SOL&outputCurrency=' + token
            : undefined,
        },
        timestamp: Date.now(),
      };

      await sendDiscordSignal(payload);
      logSignal(payload);
      logger.info('[TradingEngine] Signal-only mode: Sent BUY signal for ' + token);
      return true;
    }
    return false;
  }

  public async buyToken(
    outputMint: PublicKey,
    pairAddress?: string,
    marketData?: any,
  ): Promise<boolean> {
    try {
      const positionSizeSol = await this.calculatePositionSize(
        marketData?.currentPrice ?? 0,
        marketData,
      );

      if (
        !(await this.handleSignalMode(
          outputMint.toString(),
          marketData?.symbol || outputMint.toString(),
          pairAddress || '',
          marketData || {},
        ))
      ) {
        return false;
      }

      const quote = await this.getQuote(outputMint, pairAddress || '', marketData || {});
      if (!quote) {
        logger.error(`[TradingEngine] Failed to get quote for ${outputMint.toString()}`);
        return false;
      }

      // Multi-key: rotate key if manager present
      let tradeKeypair = this.wallet;
      if (this.keyRotationManager) {
        tradeKeypair = this.keyRotationManager.nextKeypair();
        logger.info(
          `[KeyRotation] Rotated to key ${tradeKeypair.publicKey.toBase58()} for buyToken`,
        );
      }
      const success = await this.executeSwap(
        outputMint,
        pairAddress || '',
        positionSizeSol,
        quote,
        tradeKeypair,
      );
      if (success) {
        this.currentPositions.set(outputMint.toString(), {
          entryPrice: marketData?.currentPrice ?? 0,
          entryTimestamp: Date.now(),
          amountBoughtUi: positionSizeSol,
          pairAddress: pairAddress || '',
        });
      }
      return success;
    } catch (error) {
      logger.error('[TradingEngine] BUY operation failed: ' + error);
      return false;
    }
  }

  private async getQuote(
    outputMint: PublicKey,
    pairAddress: string,
    marketData: any,
  ): Promise<QuoteResponse | null> {
    try {
      const jupiterClient = createJupiterApiClient();

      const inputMint = new PublicKey('So11111111111111111111111111111111111111112'); // SOL

      const quoteParams: QuoteGetRequest = {
        inputMint: inputMint.toString(),
        outputMint: outputMint.toString(),
        amount: marketData.positionSizeSol * 1e9,
        slippageBps: marketData.slippageBps ?? 50,
      };

      const quote = await jupiterClient.quoteGet(quoteParams);
      return quote;
    } catch (error) {
      logger.error(`[TradingEngine] Failed to get quote for ${outputMint.toString()}: ${error}`);
      return null;
    }
  }

  private async executeSwap(
    outputMint: PublicKey,
    pairAddress: string,
    positionSizeSol: number,
    quote: QuoteResponse,
    keypair?: Keypair,
  ): Promise<boolean> {
    try {
      // TODO: Implement or correct buildSwapTransaction method on TxnBuilder
      // Use supplied keypair or fallback to this.wallet
      const signer = keypair || this.wallet;
      logger.info(`[KeyRotation] Using key ${signer.publicKey.toBase58()} for executeSwap`);
      // const transaction = await this.txnBuilder.buildSwapTransaction(
      //     signer.publicKey,
      //     outputMint,
      //     pairAddress,
      //     positionSizeSol,
      //     quote
      // );
      const transaction = null; // Stub for now

      let txid = null;
      if (transaction) {
        txid = await this.sendAndConfirmTransaction(transaction, 'SWAP', outputMint.toString());
      }

      if (txid) {
        logger.info(
          `[TradingEngine] Successfully executed swap for ${outputMint.toString()} (TX: ${txid})`,
        );
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`[TradingEngine] Failed to execute swap for ${outputMint.toString()}: ${error}`);
      return false;
    }
  }
  public async sellToken(
    tokenMint: PublicKey,
    pairAddress?: string,
    marketData?: any,
  ): Promise<boolean> {
    try {
      if (
        !(await this.handleSignalMode(
          tokenMint.toString(),
          marketData?.symbol || tokenMint.toString(),
          pairAddress || '',
          marketData || {},
        ))
      ) {
        return false;
      }

      const quote = await this.getQuote(tokenMint, pairAddress || '', marketData || {});
      if (!quote) {
        logger.error(`[TradingEngine] Failed to get quote for ${tokenMint.toString()}`);
        return false;
      }

      const position = this.currentPositions.get(tokenMint.toString());
      if (!position) {
        logger.error(`[TradingEngine] No position found for ${tokenMint.toString()}`);
        return false;
      }

      if (typeof position.amountBoughtUi !== 'number') {
        logger.error(`[TradingEngine] amountBoughtUi is undefined for ${tokenMint.toString()}`);
        return false;
      }
      return await this.executeSwap(
        tokenMint,
        pairAddress || '',
        position.amountBoughtUi ?? 0,
        quote,
      );
    } catch (error) {
      logger.error('[TradingEngine] SELL operation failed: ' + error);
      return false;
    }
  }

  public async closePosition(
    tokenMint: PublicKey,
    pairAddress?: string,
    marketData?: any,
  ): Promise<boolean> {
    try {
      const position = this.currentPositions.get(tokenMint.toString());
      if (!position) {
        logger.error(`[TradingEngine] No position found for ${tokenMint.toString()}`);
        return false;
      }

      const success = await this.sellToken(tokenMint, pairAddress, marketData);
      if (success) {
        const position = this.currentPositions.get(tokenMint.toString());
        if (position && marketData?.currentPrice) {
          const pnl = this.calculatePositionPnl(position, marketData.currentPrice);
          logger.info(
            `[TradingEngine] Closed position for ${tokenMint.toString()}: P&L = ${pnl.toFixed(2)} SOL`,
          );
          // TODO: Implement or correct logTrade method on tradeLogger
          /*
                    tradeLogger.logTrade({
                        token: tokenMint.toString(),
                        entryPrice: position.entryPrice,
                        exitPrice: marketData.currentPrice,
                        pnl: pnl,
                        timestamp: Date.now(),
                        duration: (Date.now() - position.entryTimestamp) / 1000
                    });
                    */
        }
        this.currentPositions.delete(tokenMint.toString());
      }
      return success;
    } catch (error) {
      logger.error('[TradingEngine] Failed to close position: ' + error);
      return false;
    }
  }

  private calculatePositionPnl(position: PositionInfo, currentPrice: number): number {
    if (typeof position.amountBoughtUi !== 'number' || isNaN(position.amountBoughtUi)) return 0;

    const entryPrice = position.entryPrice;
    const pnl = (currentPrice - entryPrice) * (position.amountBoughtUi ?? 0);
    return pnl;
  }

  private isPositionInDrawdown(position: PositionInfo, currentPrice: number): boolean {
    if (typeof position.amountBoughtUi !== 'number' || isNaN(position.amountBoughtUi)) return false;

    const pnl = this.calculatePositionPnl(position, currentPrice);
    const denominator =
      position.entryPrice *
      (typeof position.amountBoughtUi === 'number' ? position.amountBoughtUi : 1); // already guarded above
    const drawdownPercent = denominator !== 0 ? Math.abs(pnl / denominator) * 100 : 0;
    return drawdownPercent >= this.drawdownAlertPct;
  }

  public async monitorPositions(): Promise<void> {
    try {
      const positions = Array.from(this.currentPositions.entries());
      for (const [tokenMint, position] of positions) {
        const tokenPublicKey = new PublicKey(tokenMint);
        // TODO: Implement or correct getMarketData method on strategyCoordinator
        // const marketData = await this.strategyCoordinator.getMarketData(tokenPublicKey);
        const marketData: any = { currentPrice: 0 }; // Stub for now

        if (marketData?.currentPrice) {
          const isDrawdown = this.isPositionInDrawdown(position, marketData.currentPrice);
          if (isDrawdown) {
            logger.warn(
              `[TradingEngine] Position in drawdown: ${tokenMint} - ${marketData.currentPrice}`,
            );
            await sendAlert(`Position Alert: ${tokenMint} is in drawdown`);

            // Check if we've exceeded max drawdown
            const drawdownPercent =
              Math.abs(
                this.calculatePositionPnl(position, marketData.currentPrice) /
                  (position.entryPrice * (position.amountBoughtUi ?? 0)),
              ) * 100;
            if (drawdownPercent >= this.maxDrawdownPercent) {
              logger.warn(
                `[TradingEngine] Max drawdown reached for ${tokenMint} - Closing position`,
              );
              await this.closePosition(tokenPublicKey, position.pairAddress, marketData);
            }
          }
        }
      }
    } catch (error) {
      logger.error('[TradingEngine] Error monitoring positions: ' + error);
    }
  }

  private async sendAndConfirmTransaction(
    transaction: VersionedTransaction,
    description: string,
    tokenMint: string,
  ): Promise<string | null> {
    try {
      const sendTime = Date.now();
      // VersionedTransaction does not have instructions directly; use message.instructions if needed
      // If you need to check for instructions, use transaction.message.instructions
      if (
        'message' in transaction &&
        Array.isArray((transaction as any).message.instructions) &&
        (transaction as any).message.instructions.length > 0
      ) {
        const result = await this.connection.sendTransaction(transaction, {
          skipPreflight: true,
          maxRetries: 2,
        });

        // result may be a string or an object, add type guards
        if (
          typeof result === 'object' &&
          result !== null &&
          'value' in result &&
          (result as any).value &&
          (result as any).value.err
        ) {
          throw new Error('Transaction error: ' + JSON.stringify((result as any).value.err));
        }
        // Add any additional logic or return as needed
      }
      return null;
    } catch (error) {
      logger.error('[TradingEngine] Error during transaction: ' + error);
      return null;
    }
  }
}
