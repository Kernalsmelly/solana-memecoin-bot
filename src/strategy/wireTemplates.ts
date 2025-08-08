// Wires token discovery to TxnBuilder template creation for ultra-low-latency trading
import { TokenDiscovery } from '../discovery/tokenDiscovery.js';
import { TxnBuilder } from '../services/txnBuilder.js';
import { Keypair } from '@solana/web3.js';
import logger from '../utils/logger.js';

/**
 * Listen for new pools/tokens and pre-build transaction templates for each.
 * Call this after initializing TokenDiscovery and TxnBuilder.
 * @param tokenDiscovery TokenDiscovery instance
 * @param txnBuilder TxnBuilder instance
 * @param signers Array of Keypair(s) for signing
 */
export function wireTemplateCreation(
  tokenDiscovery: TokenDiscovery,
  txnBuilder: TxnBuilder,
  signers: Keypair[],
) {
  tokenDiscovery.on('tokenDiscovered', async (token: any) => {
    try {
      // Use token.address as poolKey; adapt as needed for Raydium/Orca
      const poolKey = token.address;
      logger.info(`[wireTemplates] Pre-building TX templates for pool ${poolKey}`);
      await txnBuilder.buildTemplateTx(
        {
          poolKey,
          inputMint: token.baseMint || token.base || token.inputMint || '',
          outputMint: token.quoteMint || token.quote || token.outputMint || '',
        },
        'buy',
        signers,
      );
      await txnBuilder.buildTemplateTx(
        {
          poolKey,
          inputMint: token.quoteMint || token.quote || token.outputMint || '',
          outputMint: token.baseMint || token.base || token.inputMint || '',
        },
        'sell',
        signers,
      );
    } catch (e) {
      logger.error(`[wireTemplates] Failed to build TX template for ${token.address}:`, e);
    }
  });
}
