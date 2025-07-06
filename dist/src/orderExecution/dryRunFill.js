"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDryRunFill = handleDryRunFill;
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Handles a dry-run fill for a simulated swap. Records trade with risk manager and logs the fill.
 * @param params - Details of the simulated fill
 */
async function handleDryRunFill(params, injectedRiskManager) {
    const { action, tokenAddress, tokenSymbol, quantity, price, meta } = params;
    const pnl = 0; // For dry-run, P&L is 0 at open; update on close
    const trade = {
        timestamp: Date.now(),
        action,
        tokenAddress,
        tokenSymbol,
        quantity,
        price,
        pnl,
        ...meta
    };
    logger_1.default.info('[DryRunFill] Simulated fill', trade);
    const rm = injectedRiskManager;
    if (!rm || typeof rm.recordTrade !== 'function') {
        throw new Error('No valid riskManager provided to handleDryRunFill');
    }
    if (rm && typeof rm.recordTrade === 'function') {
        rm.recordTrade(pnl); // Record trade with dummy P&L for now
    }
    // Optionally, persist trade to disk or emit event here
}
//# sourceMappingURL=dryRunFill.js.map