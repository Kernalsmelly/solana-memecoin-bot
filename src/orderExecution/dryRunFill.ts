import { RiskManager } from '../live/riskManager';
import { TradeHistoryEntry } from '../types';
import logger from '../utils/logger';

/**
 * Handles a dry-run fill for a simulated swap. Records trade with risk manager and logs the fill.
 * @param params - Details of the simulated fill
 */
export async function handleDryRunFill(params: {
  action: 'buy' | 'sell';
  tokenAddress: string;
  tokenSymbol?: string;
  quantity: number;
  price: number;
  meta?: Record<string, any>;
}, injectedRiskManager?: { recordTrade: (pnl: number) => void }) {
  const { action, tokenAddress, tokenSymbol, quantity, price, meta } = params;
  const pnl = 0; // For dry-run, P&L is 0 at open; update on close
  const trade: TradeHistoryEntry = {
    timestamp: Date.now(),
    action,
    tokenAddress,
    tokenSymbol,
    quantity,
    price,
    pnl,
    ...meta
  };
  logger.info('[DryRunFill] Simulated fill', trade);
  const rm = injectedRiskManager;
  if (!rm || typeof rm.recordTrade !== 'function') {
    throw new Error('No valid riskManager provided to handleDryRunFill');
  }
  if (rm && typeof rm.recordTrade === 'function') {
    rm.recordTrade(pnl); // Record trade with dummy P&L for now
  }
  // Optionally, persist trade to disk or emit event here
}
