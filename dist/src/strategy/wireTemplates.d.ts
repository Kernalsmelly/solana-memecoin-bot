import { TokenDiscovery } from '../discovery/tokenDiscovery.js';
import { TxnBuilder } from '../services/txnBuilder.js';
import { Keypair } from '@solana/web3.js';
/**
 * Listen for new pools/tokens and pre-build transaction templates for each.
 * Call this after initializing TokenDiscovery and TxnBuilder.
 * @param tokenDiscovery TokenDiscovery instance
 * @param txnBuilder TxnBuilder instance
 * @param signers Array of Keypair(s) for signing
 */
export declare function wireTemplateCreation(tokenDiscovery: TokenDiscovery, txnBuilder: TxnBuilder, signers: Keypair[]): void;
//# sourceMappingURL=wireTemplates.d.ts.map