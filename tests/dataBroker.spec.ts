import { describe, it, expect, beforeEach } from 'vitest';
import nock from 'nock';
import { DataBroker } from '../src/integrations/data-hub/DataBroker';

describe('DataBroker', () => {
  beforeEach(() => nock.cleanAll());

  it('returns Dexscreener data (happy path)', async () => {
    nock('https://api.dexscreener.com')
      .get(/.*/)
      .reply(200, {
        pairs: [
          {
            priceUsd: '1.23',
            liquidity: { usd: '1000' },
            fdv: '9000',
            volume: { h24: '10000' },
            updatedAt: 1720000000000,
          },
        ],
      });
    const res = await DataBroker.getTokenData('FAKE');
    expect(res.priceUSD).toBe(1.23);
    expect(res.liquidityUSD).toBe(1000);
    expect(res.fdvUSD).toBe(9000);
    expect(res.volume24hUSD).toBe(10000);
    expect(res.lastTradeTs).toBe(1720000000);
  });

  it('falls back to GeckoTerminal on Dexscreener 429', async () => {
    nock('https://api.dexscreener.com').get(/.*/).reply(429);
    nock('https://api.geckoterminal.com')
      .get(/.*/)
      .reply(200, {
        data: {
          attributes: {
            price_usd: '2.34',
            liquidity_usd: '2000',
            fdv_usd: '18000',
            volume_usd_24h: '20000',
            last_trade_at: '2024-01-01T00:00:00Z',
          },
        },
      });
    const res = await DataBroker.getTokenData('FAKE2');
    expect(res.priceUSD).toBe(2.34);
    expect(res.liquidityUSD).toBe(2000);
    expect(res.fdvUSD).toBe(18000);
    expect(res.volume24hUSD).toBe(20000);
    expect(res.lastTradeTs).toBe(Math.floor(new Date('2024-01-01T00:00:00Z').getTime() / 1000));
  });

  it('bubbles error if all sources fail', async () => {
    nock('https://api.dexscreener.com').get(/.*/).reply(500);
    nock('https://api.geckoterminal.com').get(/.*/).reply(500);
    nock('https://public-api.birdeye.so').get(/.*/).reply(500);
    await expect(DataBroker.getTokenData('FAIL')).rejects.toThrow();
  });
});
