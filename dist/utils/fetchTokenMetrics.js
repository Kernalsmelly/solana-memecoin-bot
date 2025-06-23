"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTokenMetrics = fetchTokenMetrics;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./logger"));
/**
 * Fetches token metrics from Dexscreener, Birdeye, and Coingecko (fallback).
 * @param tokenAddress - The Solana token address (mint)
 * @param poolAddress - The pool address (optional, for DEX queries)
 * @returns TokenMetrics or null if not found
 */
async function fetchTokenMetrics(tokenAddress, poolAddress) {
    // 1. Try Dexscreener
    try {
        const url = `https://api.dexscreener.com/latest/dex/tokens/solana/${tokenAddress}`;
        const response = await axios_1.default.get(url, { timeout: 8000 });
        if (response.data?.pairs?.length) {
            // Pick the pair with the highest 24h volume
            const pair = response.data.pairs.reduce((a, b) => (a.volume?.h24 || 0) > (b.volume?.h24 || 0) ? a : b);
            return {
                address: tokenAddress,
                symbol: pair.baseToken?.symbol || 'UNKNOWN',
                name: pair.baseToken?.name,
                priceUsd: parseFloat(pair.priceUsd),
                liquidity: pair.liquidity?.usd ? parseFloat(pair.liquidity.usd) : undefined,
                volume24h: pair.volume?.h24 ? parseFloat(pair.volume.h24) : undefined,
                buyRatio: pair.txns?.h24?.buys && pair.txns?.h24?.sells ? pair.txns.h24.buys / Math.max(1, pair.txns.h24.sells) : undefined,
                holders: pair.holders,
                timestamp: Date.now()
            };
        }
    }
    catch (err) {
        logger_1.default.warn(`[fetchTokenMetrics] Dexscreener failed for ${tokenAddress}: ${err.message}`);
    }
    // 2. Try Birdeye (if API key available)
    if (process.env.BIRDEYE_API_KEY) {
        try {
            const url = `https://public-api.birdeye.so/public/token/${tokenAddress}`;
            const response = await axios_1.default.get(url, { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY }, timeout: 8000 });
            if (response.data?.data) {
                const t = response.data.data;
                return {
                    address: tokenAddress,
                    symbol: t.symbol || 'UNKNOWN',
                    name: t.name,
                    priceUsd: t.price || 0,
                    liquidity: t.liquidity?.usd,
                    volume24h: t.volume_24h,
                    holders: t.holders,
                    ageHours: t.age_hours,
                    timestamp: Date.now()
                };
            }
        }
        catch (err) {
            logger_1.default.warn(`[fetchTokenMetrics] Birdeye failed for ${tokenAddress}: ${err.message}`);
        }
    }
    // 3. Fallback: Try Coingecko (for known tokens)
    try {
        const coingeckoId = getCoingeckoId(tokenAddress);
        if (coingeckoId) {
            const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}`;
            const response = await axios_1.default.get(url, { timeout: 8000 });
            if (response.data?.market_data?.current_price?.usd) {
                return {
                    address: tokenAddress,
                    symbol: response.data.symbol.toUpperCase(),
                    name: response.data.name,
                    priceUsd: response.data.market_data.current_price.usd,
                    liquidity: undefined,
                    volume24h: response.data.market_data.total_volume.usd,
                    holders: undefined,
                    ageHours: undefined,
                    timestamp: Date.now()
                };
            }
        }
    }
    catch (err) {
        logger_1.default.warn(`[fetchTokenMetrics] Coingecko failed for ${tokenAddress}: ${err.message}`);
    }
    // 4. Fallback: Try Solscan for holders and ageHours if nothing else worked
    try {
        logger_1.default.info(`[fetchTokenMetrics] Attempting Solscan fallback for ${tokenAddress}`);
        const url = `https://public-api.solscan.io/token/meta?tokenAddress=${tokenAddress}`;
        const response = await axios_1.default.get(url, { timeout: 8000 });
        if (response.data) {
            // Solscan may not provide price/liquidity, but can give holders and creation time
            const t = response.data;
            let ageHours = undefined;
            if (t.createdAt) {
                const created = new Date(t.createdAt * 1000);
                ageHours = (Date.now() - created.getTime()) / (1000 * 60 * 60);
            }
            return {
                address: tokenAddress,
                symbol: t.symbol || 'UNKNOWN',
                name: t.name,
                priceUsd: 0, // Not available from Solscan
                liquidity: undefined,
                volume24h: undefined,
                buyRatio: undefined,
                holders: t.holder_count,
                ageHours,
                timestamp: Date.now()
            };
        }
    }
    catch (err) {
        logger_1.default.warn(`[fetchTokenMetrics] Solscan failed for ${tokenAddress}: ${err.message}`);
    }
    logger_1.default.warn(`[fetchTokenMetrics] No metrics found for ${tokenAddress}`);
    return null;
}
function getCoingeckoId(address) {
    // Add mappings for popular Solana tokens
    const mappings = {
        'So11111111111111111111111111111111111111112': 'solana',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin',
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether',
        // Add more as needed
    };
    return mappings[address] || null;
}
//# sourceMappingURL=fetchTokenMetrics.js.map