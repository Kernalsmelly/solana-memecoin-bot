import { Connection, Transaction } from '@solana/web3.js';

export async function getFeeEstimate(connection: Connection, tx: Transaction): Promise<number> {
  const { feeCalculator } = await connection.getRecentBlockhash();
  // Fallback for new API if needed
  return feeCalculator?.lamportsPerSignature || 5000;
}

export function isSlippageTooHigh(quoteSlippageBps: number, limitBps: number): boolean {
  return quoteSlippageBps > limitBps;
}

export interface SlippageWarningEvent {
  type: 'slippageWarning';
  quoteSlippageBps: number;
  limitBps: number;
  context?: any;
}
