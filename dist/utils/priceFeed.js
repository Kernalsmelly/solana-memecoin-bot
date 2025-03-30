"use strict";
// src/utils/priceFeed.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTokenPrice = fetchTokenPrice;
const axios_1 = __importDefault(require("axios"));
/**
 * Fetches the price of a token from the Jupiter API.
 * @param tokenAddress - The Solana token address.
 * @param currency - The fiat currency (default: 'usd').
 * @returns The current price of the token.
 */
async function fetchTokenPrice(tokenAddress, currency = 'usd') {
    try {
        const url = `https://price.jup.ag/v4/price?ids=${tokenAddress}`;
        const response = await axios_1.default.get(url);
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
