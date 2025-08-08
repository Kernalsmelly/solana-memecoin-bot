import { PatternDetector } from './patternDetector.js';
import { TxnBuilder } from '../services/txnBuilder.js';
import { Keypair } from '@solana/web3.js';
/**
 * Listens for patternMatch and executes the pre-built template transaction for the detected pool/pattern.
 * @param patternDetector PatternDetector instance
 * @param txnBuilder TxnBuilder instance
 * @param signers Array of Keypair(s) for signing
 */
export declare function wireFastTradeExecution(patternDetector: PatternDetector, txnBuilder: TxnBuilder, signers: Keypair[]): void;
//# sourceMappingURL=fastTradeExecutor.d.ts.map