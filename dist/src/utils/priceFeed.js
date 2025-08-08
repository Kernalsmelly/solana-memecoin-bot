// src/utils/priceFeed.ts
import axios from 'axios';
/**
 * Fetches the price of a token from the Jupiter API.
 * @param tokenAddress - The Solana token address.
 * @param currency - The fiat currency (default: 'usd').
 * @returns The current price of the token.
 */
export async function fetchTokenPrice(tokenAddress, currency = 'usd') {
    // PILOT PATCH: Return static mock price, never call axios
    return 1.05;
    try {
        const url = `https://price.jup.ag/v4/price?ids=${tokenAddress}`;
        const response = await axios.get(url);
        // The response is assumed to be structured like:
        // { [tokenAddress]: { usd: price } }
        if (response.data &&
            response.data[tokenAddress] &&
            response.data[tokenAddress][currency] !== undefined) {
            return response.data[tokenAddress][currency];
        }
        else {
            throw new Error('Price not found in response');
        }
    }
    catch (error) {
        console.error(`Error fetching price for token ${tokenAddress}:`, error.message);
        throw error;
    }
}
//# sourceMappingURL=priceFeed.js.map