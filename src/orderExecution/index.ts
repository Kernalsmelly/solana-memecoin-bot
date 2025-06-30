import { EventEmitter } from 'events';
import logger from '../utils/logger';

export interface DryRunSwapParams {
  inputMint: string;
  outputMint: string;
  amountIn: number;
  slippageBps?: number;
  userPublicKey: string;
  meta?: Record<string, any>;
}

export interface DryRunSwapResult {
  success: boolean;
  simulated: boolean;
  txLog: any;
  reason?: string;
}

/**
 * DryRunOrderExecution simulates a Jupiter V6 swap and logs the unsigned transaction.
 * No real swap is sent; this is for safe testing and strategy development.
 */
export class DryRunOrderExecution extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Simulate a swap and log the unsigned transaction details
   */
  async executeSwap(params: DryRunSwapParams): Promise<DryRunSwapResult> {
    logger.info('[DryRunOrderExecution] Simulating Jupiter swap', params);
    // Simulate unsigned transaction (mock structure)
    const unsignedTx = {
      program: 'JupiterV6',
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amountIn: params.amountIn,
      slippageBps: params.slippageBps || 50,
      user: params.userPublicKey,
      meta: params.meta || {},
      timestamp: Date.now(),
    };
    logger.info('[DryRunOrderExecution] Unsigned Tx:', unsignedTx);
    this.emit('dryRunSwap', unsignedTx);
    return {
      success: true,
      simulated: true,
      txLog: unsignedTx
    };
  }
}

export default DryRunOrderExecution;
