import axios from 'axios';

export interface JupiterQuote {
  inAmount: number;
  outAmount: number;
  price: number;
  route: any;
  tx: any;
}

export async function fetchJupiterQuote({
  inputMint,
  outputMint,
  amount,
  slippageBps
}: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}): Promise<JupiterQuote | null> {
  try {
    const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
    const res = await axios.get(url);
    if (!res.data || !res.data.data || !res.data.data[0]) return null;
    const q = res.data.data[0];
    return {
      inAmount: q.inAmount,
      outAmount: q.outAmount,
      price: q.price,
      route: q.route,
      tx: q.tx
    };
  } catch (e) {
    console.debug('[JupiterQuote] REST error', e);
    return null;
  }
}
