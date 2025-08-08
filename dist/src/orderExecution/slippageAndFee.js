export async function getFeeEstimate(connection, tx) {
    const { feeCalculator } = await connection.getRecentBlockhash();
    // Fallback for new API if needed
    return feeCalculator?.lamportsPerSignature || 5000;
}
export function isSlippageTooHigh(quoteSlippageBps, limitBps) {
    return quoteSlippageBps > limitBps;
}
//# sourceMappingURL=slippageAndFee.js.map