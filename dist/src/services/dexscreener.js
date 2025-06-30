"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchDexscreenerPoolData = fetchDexscreenerPoolData;
// Dexscreener API helper for pool/market data enrichment
const axios_1 = __importDefault(require("axios"));
// Accepts baseMint and quoteMint (SPL addresses as strings)
async function fetchDexscreenerPoolData(baseMint, quoteMint) {
    try {
        // Dexscreener Solana endpoint
        const url = `https://api.dexscreener.com/latest/dex/pairs/solana/${baseMint}`;
        const response = await axios_1.default.get(url);
        if (!response.data || !response.data.pairs || !Array.isArray(response.data.pairs))
            return null;
        // Find the pair with the matching quote mint (if possible)
        const pair = response.data.pairs.find((p) => p.baseToken.address === baseMint &&
            p.quoteToken.address === quoteMint);
        if (!pair)
            return null;
        return {
            liquidityUsd: pair.liquidity && pair.liquidity.usd ? Number(pair.liquidity.usd) : undefined,
            volume24hUsd: pair.volume && pair.volume.h24 ? Number(pair.volume.h24) : undefined,
            tokenName: pair.baseToken.name,
            tokenSymbol: pair.baseToken.symbol,
            tokenDecimals: pair.baseToken.decimals
        };
    }
    catch (error) {
        // Optionally log error
        return null;
    }
}
//# sourceMappingURL=dexscreener.js.map