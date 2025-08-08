/**
 * Fetch a swap transaction from Jupiter's /swap endpoint.
 *
 * @param {object} params
 * @param {string} params.inputMint - The input token mint address (e.g. SOL)
 * @param {string} params.outputMint - The output token mint address (e.g. USDC)
 * @param {number} params.amount - Amount in smallest units (e.g. lamports)
 * @param {number} params.slippageBps - Slippage in basis points
 * @param {string} params.userPublicKey - The user's wallet public key (base58)
 * @returns {Promise<string|null>} - The base64-encoded transaction, or null if not available
 */
export declare function fetchJupiterSwapTx({ inputMint, outputMint, amount, slippageBps, userPublicKey, quoteResponse, }: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
    userPublicKey: string;
    quoteResponse: any;
}): Promise<string | null>;
//# sourceMappingURL=jupiterSwap.d.ts.map