// Dexscreener API helper for pool/market data enrichment
import axios from 'axios';

export interface DexscreenerPoolData {
  liquidityUsd?: number;
  volume24hUsd?: number;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

// Accepts baseMint and quoteMint (SPL addresses as strings)
export async function fetchDexscreenerPoolData(
  baseMint: string,
  quoteMint: string,
): Promise<DexscreenerPoolData | null> {
  try {
    // Dexscreener Solana endpoint
    const url = `https://api.dexscreener.com/latest/dex/pairs/solana/${baseMint}`;
    const response = await axios.get(url);
    if (!response.data || !response.data.pairs || !Array.isArray(response.data.pairs)) return null;
    // Find the pair with the matching quote mint (if possible)
    const pair = response.data.pairs.find(
      (p: any) => p.baseToken.address === baseMint && p.quoteToken.address === quoteMint,
    );
    if (!pair) return null;
    return {
      liquidityUsd: pair.liquidity && pair.liquidity.usd ? Number(pair.liquidity.usd) : undefined,
      volume24hUsd: pair.volume && pair.volume.h24 ? Number(pair.volume.h24) : undefined,
      tokenName: pair.baseToken.name,
      tokenSymbol: pair.baseToken.symbol,
      tokenDecimals: pair.baseToken.decimals,
    };
  } catch (error) {
    // Optionally log error
    return null;
  }
}
