import { EventEmitter } from 'events';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import axios from 'axios';
import logger from '../utils/logger';

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amountIn: number;
  slippageBps?: number;
  userPublicKey: string;
  meta?: Record<string, any>;
}

export interface SwapResult {
  success: boolean;
  txSignature?: string;
  reason?: string;
}

export interface Signer {
  publicKey: PublicKey;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

export class JupiterOrderExecution extends EventEmitter {
  private connection: Connection;
  private signer: Signer;
  private jupiterApi: string;

  constructor(connection: Connection, signer: Signer, jupiterApi = 'https://quote-api.jup.ag/v6') {
    super();
    this.connection = connection;
    this.signer = signer;
    this.jupiterApi = jupiterApi;
  }

  async executeSwap(params: SwapParams): Promise<SwapResult> {
    try {
      logger.info('[JupiterOrderExecution] Fetching quote', params);
      const quoteRes = await axios.get(`${this.jupiterApi}/quote`, {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amountIn,
          slippageBps: params.slippageBps || 50,
          onlyDirectRoutes: false,
          userPublicKey: params.userPublicKey,
        }
      });
      const route = quoteRes.data.routes?.[0];
      if (!route) throw new Error('No route found');

      logger.info('[JupiterOrderExecution] Requesting swap transaction');
      const swapRes = await axios.post(`${this.jupiterApi}/swap`, {
        route,
        userPublicKey: params.userPublicKey,
        wrapAndUnwrapSol: true
      });
      const { swapTransaction } = swapRes.data;
      if (!swapTransaction) throw new Error('No swap transaction received');

      // Deserialize transaction
      const txBuf = Buffer.from(swapTransaction, 'base64');
      let tx = Transaction.from(txBuf);
      tx = await this.signer.signTransaction(tx);
      logger.info('[OrderSubmitted] Signature (pending):', tx.signature?.toString('base58'));
      this.emit('orderSubmitted', { tx });

      const sig = await this.connection.sendRawTransaction(tx.serialize());
      logger.info('[OrderSubmitted] Signature:', sig);
      this.emit('orderSubmitted', { signature: sig });

      const confirmation = await this.connection.confirmTransaction(sig, 'confirmed');
      logger.info('[OrderConfirmed] Signature:', sig, confirmation);
      this.emit('orderConfirmed', { signature: sig, confirmation });

      return { success: true, txSignature: sig };
    } catch (e: any) {
      logger.error('[JupiterOrderExecution] Swap failed', e);
      return { success: false, reason: e.message || e.toString() };
    }
  }
}

export default JupiterOrderExecution;
