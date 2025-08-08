import { TokenMetrics } from './fetchTokenMetrics.js';
import { RiskManager } from '../live/riskManager.js';
import { AccountBalance } from '../positionManager.js';
/**
 * Calculates optimal position size based on risk, liquidity, and available balance.
 * @param token TokenMetrics for the trade
 * @param riskManager Instance of RiskManager
 * @param accountBalance Current account balance info
 * @returns Position size in USD
 */
export declare function calculatePositionSize(token: TokenMetrics, riskManager: RiskManager, accountBalance: AccountBalance): number;
//# sourceMappingURL=positionSizing.d.ts.map