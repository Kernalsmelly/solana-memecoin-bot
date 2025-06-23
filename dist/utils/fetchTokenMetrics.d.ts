export interface TokenMetrics {
    address: string;
    symbol: string;
    name?: string;
    priceUsd: number;
    liquidity?: number;
    volume24h?: number;
    buyRatio?: number;
    holders?: number;
    ageHours?: number;
    timestamp?: number;
}
/**
 * Fetches token metrics from Dexscreener, Birdeye, and Coingecko (fallback).
 * @param tokenAddress - The Solana token address (mint)
 * @param poolAddress - The pool address (optional, for DEX queries)
 * @returns TokenMetrics or null if not found
 */
export declare function fetchTokenMetrics(tokenAddress: string, poolAddress?: string): Promise<TokenMetrics | null>;
//# sourceMappingURL=fetchTokenMetrics.d.ts.map