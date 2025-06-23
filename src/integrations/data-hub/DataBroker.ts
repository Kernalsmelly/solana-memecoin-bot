import axios from 'axios';
import PQueue from 'p-queue';
import { LRUCache } from 'lru-cache';

export type DataResult = {
  priceUSD: number | null;
  liquidityUSD: number | null;
  fdvUSD: number | null;
  volume24hUSD: number | null;
  lastTradeTs: number | null;
};

const TTL = Number(process.env.CACHE_TTL_MS) || 10000;
const cache = new LRUCache<string, DataResult>({ max: 500, ttl: TTL });

const queues = {
  dexscreener: new PQueue({ interval: 60000, intervalCap: 55 }),
  gecko: new PQueue({ interval: 60000, intervalCap: 55 }),
  birdeye: new PQueue({ interval: 60000, intervalCap: 25 }),
};

async function fetchDexscreener(address: string): Promise<DataResult> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
  const { data } = await axios.get(url, { timeout: 5000 });
  const pair = data.pairs?.[0];
  return {
    priceUSD: pair?.priceUsd ? Number(pair.priceUsd) : null,
    liquidityUSD: pair?.liquidity?.usd ? Number(pair.liquidity.usd) : null,
    fdvUSD: pair?.fdv ? Number(pair.fdv) : null,
    volume24hUSD: pair?.volume?.h24 ? Number(pair.volume.h24) : null,
    lastTradeTs: pair?.updatedAt ? Math.floor(Number(pair.updatedAt) / 1000) : null,
  };
}

async function fetchGeckoTerminal(address: string): Promise<DataResult> {
  const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${address}`;
  const { data } = await axios.get(url, { timeout: 5000 });
  const attr = data.data?.attributes;
  return {
    priceUSD: attr?.price_usd ? Number(attr.price_usd) : null,
    liquidityUSD: attr?.liquidity_usd ? Number(attr.liquidity_usd) : null,
    fdvUSD: attr?.fdv_usd ? Number(attr.fdv_usd) : null,
    volume24hUSD: attr?.volume_usd_24h ? Number(attr.volume_usd_24h) : null,
    lastTradeTs: attr?.last_trade_at ? Math.floor(new Date(attr.last_trade_at).getTime() / 1000) : null,
  };
}

async function fetchBirdeye(address: string): Promise<DataResult> {
  const url = `https://public-api.birdeye.so/public/price?address=${address}`;
  const { data } = await axios.get(url, { timeout: 5000 });
  const d = data.data;
  return {
    priceUSD: d?.value ? Number(d.value) : null,
    liquidityUSD: d?.liquidity ? Number(d.liquidity) : null,
    fdvUSD: d?.fdv ? Number(d.fdv) : null,
    volume24hUSD: d?.volume_24h ? Number(d.volume_24h) : null,
    lastTradeTs: d?.updateUnixTime ? Number(d.updateUnixTime) : null,
  };
}

const sources: [keyof typeof queues, (address: string) => Promise<DataResult>][] = [
  ['dexscreener', fetchDexscreener],
  ['gecko', fetchGeckoTerminal],
  ['birdeye', fetchBirdeye],
];

function isValid(res: DataResult) {
  return typeof res.priceUSD === 'number' && !isNaN(res.priceUSD);
}

export class DataBroker {
  static async getTokenData(address: string): Promise<DataResult> {
    if (cache.has(address)) return cache.get(address)!;
    let lastErr: any;
    for (const [key, fn] of sources) {
      try {
        const res = await queues[key].add(() => fn(address));
        if (isValid(res)) {
          cache.set(address, res);
          return res;
        }
      } catch (err: any) {
        if (err && err.response && [429, 403, 404, 500].includes(err.response.status)) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    // Always throw outside the loop, not inside a callback
    throw lastErr || new Error('All sources failed');
  }
}
