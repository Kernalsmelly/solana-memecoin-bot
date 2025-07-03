"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFeeEstimate = getFeeEstimate;
exports.isSlippageTooHigh = isSlippageTooHigh;
async function getFeeEstimate(connection, tx) {
    const { feeCalculator } = await connection.getRecentBlockhash();
    // Fallback for new API if needed
    return feeCalculator?.lamportsPerSignature || 5000;
}
function isSlippageTooHigh(quoteSlippageBps, limitBps) {
    return quoteSlippageBps > limitBps;
}
//# sourceMappingURL=slippageAndFee.js.map