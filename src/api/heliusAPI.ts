import axios from 'axios';

export interface HeliusTokenMetadata {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  logoURI?: string;
  tags?: string[];
  extensions?: Record<string, any>;
  [key: string]: any;
}

export async function fetchHeliusTokenMetadata(
  address: string,
  heliusApiKey: string,
): Promise<HeliusTokenMetadata | null> {
  try {
    const url = `https://api.helius.xyz/v0/token-metadata?api-key=${heliusApiKey}`;
    const res = await axios.post(url, {
      mintAccounts: [address],
    });
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      return {
        address,
        ...res.data[0],
      };
    }
    return null;
  } catch (err) {
    // Log as debug, not error (to avoid log spam)
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[HeliusAPI] Metadata fetch failed', err);
    }
    return null;
  }
}
