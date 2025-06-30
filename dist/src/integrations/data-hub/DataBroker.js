"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataBroker = void 0;
const axios_1 = __importDefault(require("axios"));
const p_queue_1 = __importDefault(require("p-queue"));
const lru_cache_1 = require("lru-cache");
const TTL = Number(process.env.CACHE_TTL_MS) || 10000;
const cache = new lru_cache_1.LRUCache({ max: 500, ttl: TTL });
const queues = {
    dexscreener: new p_queue_1.default({ interval: 60000, intervalCap: 55 }),
    gecko: new p_queue_1.default({ interval: 60000, intervalCap: 55 }),
    birdeye: new p_queue_1.default({ interval: 60000, intervalCap: 25 }),
};
async function fetchDexscreener(address) {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
    const { data } = await axios_1.default.get(url, { timeout: 5000 });
    const pair = data.pairs?.[0];
    return {
        priceUSD: pair?.priceUsd ? Number(pair.priceUsd) : null,
        liquidityUSD: pair?.liquidity?.usd ? Number(pair.liquidity.usd) : null,
        fdvUSD: pair?.fdv ? Number(pair.fdv) : null,
        volume24hUSD: pair?.volume?.h24 ? Number(pair.volume.h24) : null,
        lastTradeTs: pair?.updatedAt ? Math.floor(Number(pair.updatedAt) / 1000) : null,
    };
}
async function fetchGeckoTerminal(address) {
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${address}`;
    const { data } = await axios_1.default.get(url, { timeout: 5000 });
    const attr = data.data?.attributes;
    return {
        priceUSD: attr?.price_usd ? Number(attr.price_usd) : null,
        liquidityUSD: attr?.liquidity_usd ? Number(attr.liquidity_usd) : null,
        fdvUSD: attr?.fdv_usd ? Number(attr.fdv_usd) : null,
        volume24hUSD: attr?.volume_usd_24h ? Number(attr.volume_usd_24h) : null,
        lastTradeTs: attr?.last_trade_at ? Math.floor(new Date(attr.last_trade_at).getTime() / 1000) : null,
    };
}
async function fetchBirdeye(address) {
    const url = `https://public-api.birdeye.so/public/price?address=${address}`;
    const { data } = await axios_1.default.get(url, { timeout: 5000 });
    const d = data.data;
    return {
        priceUSD: d?.value ? Number(d.value) : null,
        liquidityUSD: d?.liquidity ? Number(d.liquidity) : null,
        fdvUSD: d?.fdv ? Number(d.fdv) : null,
        volume24hUSD: d?.volume_24h ? Number(d.volume_24h) : null,
        lastTradeTs: d?.updateUnixTime ? Number(d.updateUnixTime) : null,
    };
}
const sources = [
    ['dexscreener', fetchDexscreener],
    ['gecko', fetchGeckoTerminal],
    ['birdeye', fetchBirdeye],
];
function isValid(res) {
    return typeof res.priceUSD === 'number' && !isNaN(res.priceUSD);
}
class DataBroker {
    static async getTokenData(address) {
        if (cache.has(address))
            return cache.get(address);
        let lastErr;
        for (const [key, fn] of sources) {
            try {
                const res = await queues[key].add(() => fn(address));
                if (isValid(res)) {
                    cache.set(address, res);
                    return res;
                }
            }
            catch (err) {
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
exports.DataBroker = DataBroker;
//# sourceMappingURL=DataBroker.js.map