import axios from 'axios';
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
export async function fetchJupiterSwapTx({ inputMint, outputMint, amount, slippageBps, userPublicKey, quoteResponse, }) {
    const url = 'https://quote-api.jup.ag/v6/swap';
    try {
        const res = await axios.post(url, {
            inputMint,
            outputMint,
            amount,
            slippageBps,
            userPublicKey,
            wrapUnwrapSol: true,
            dynamicSlippage: false,
            quoteResponse,
        });
        if (res.data && res.data.swapTransaction) {
            return res.data.swapTransaction;
        }
        return null;
    }
    catch (e) {
        console.error('[JupiterSwap] Error fetching swap transaction:', e);
        return null;
    }
}
//# sourceMappingURL=jupiterSwap.js.map