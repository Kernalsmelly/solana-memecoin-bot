import { Connection, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import logger from '../utils/logger.js';
import { TradingEngine } from './tradingEngine.js';

interface ForcedPumpOptions {
  waitSec: number;
  sizeSol: number;
  dryRun: boolean;
}

export class ForcedPumpInjector {
  private connection: Connection;
  private options: ForcedPumpOptions;
  private tradingEngine: TradingEngine;
  private lastCheck: Map<string, number> = new Map(); // tokenMint -> last check timestamp

  constructor(connection: Connection, tradingEngine: TradingEngine, options: ForcedPumpOptions) {
    this.connection = connection;
    this.tradingEngine = tradingEngine;
    this.options = options;
  }

  public async inject(tokenMint: string): Promise<boolean> {
    // Check if we've already checked this token recently
    const lastCheckTime = this.lastCheck.get(tokenMint);
    if (lastCheckTime && Date.now() - lastCheckTime < this.options.waitSec * 1000) {
      return false;
    }

    // Check for recent trades
    const hasRecentTrades = await this.hasRecentTrades(tokenMint);
    if (hasRecentTrades) {
      return false;
    }

    // Inject the forced pump
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.tradingEngine.getWalletPublicKey(),
          toPubkey: new PublicKey(tokenMint),
          lamports: this.options.sizeSol * 1e9,
        }),
      );

      if (!this.options.dryRun) {
        const signature = await this.connection.sendTransaction(tx as any); // TODO: use VersionedTransaction if required
        await this.connection.confirmTransaction(signature);
        logger.info(`[ForcedPump] Injected ${this.options.sizeSol} SOL into ${tokenMint}`);
      }

      // Update last check time
      this.lastCheck.set(tokenMint, Date.now());
      return true;
    } catch (error) {
      logger.error('[ForcedPump] Failed to inject:', error);
      return false;
    }
  }

  private async hasRecentTrades(tokenMint: string): Promise<boolean> {
    try {
      const signature = await this.connection.getSignaturesForAddress(new PublicKey(tokenMint), {
        limit: 1,
        before: undefined, // Patch: 'before' must be a string, not a number
      });

      return signature.length > 0;
    } catch (error) {
      logger.warn('[ForcedPump] Failed to check recent trades:', error);
      return false;
    }
  }
}
