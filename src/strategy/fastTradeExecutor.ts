// FastTradeExecutor: Listens for patternMatch events and instantly sends pre-built transactions using TxnBuilder
import { PatternDetector } from './patternDetector.js';
import { TxnBuilder } from '../services/txnBuilder.js';
import { Keypair } from '@solana/web3.js';
import logger from '../utils/logger.js';

/**
 * Listens for patternMatch and executes the pre-built template transaction for the detected pool/pattern.
 * @param patternDetector PatternDetector instance
 * @param txnBuilder TxnBuilder instance
 * @param signers Array of Keypair(s) for signing
 */
export function wireFastTradeExecution(
  patternDetector: PatternDetector,
  txnBuilder: TxnBuilder,
  signers: Keypair[],
) {
  patternDetector.on('patternMatch', async (match: any) => {
    try {
      // Use match.address as poolKey; adapt as needed
      const poolKey = match.address;
      const amount = match.suggestedAmount || 1; // TODO: Replace with real sizing logic
      const fee = txnBuilder.priorityFee;
      const type = match.signalType === 'sell' ? 'sell' : 'buy';
      logger.info(
        `[FastTradeExecutor] Executing ${type} template for pool ${poolKey} (amount: ${amount}, fee: ${fee})`,
      );
      const sig = await txnBuilder.fillAndSendTemplateTx(poolKey, type, amount, fee, signers);
      logger.info(`[FastTradeExecutor] Trade sent for ${poolKey}, sig: ${sig}`);
    } catch (e) {
      logger.error(`[FastTradeExecutor] Failed to send fast trade for ${match.address}:`, e);
    }
  });
}
