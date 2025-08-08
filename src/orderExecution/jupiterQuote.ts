import axios from 'axios';
import { getInputMint, USDC_MINT, SOL_MINT } from '../utils/baseCurrency.js';

export interface JupiterQuote {
  inAmount: number;
  outAmount: number;
  price: number;
  route: any;
  tx: any;
}

export function parseJupiterQuote(response: any): { parsed: JupiterQuote | null; raw: any } {
  if (!response || !response.outAmount) return { parsed: null, raw: response };
  // Jupiter v6 API returns the quote at the root level
  const q = response;
  return {
    parsed: {
      inAmount: Number(q.inAmount),
      outAmount: Number(q.outAmount),
      price: Number(q.outAmount) / Number(q.inAmount),
      route: q.routePlan || q.route || null,
      tx: q.tx || null,
    },
    raw: q,
  };
}

import { config } from '../utils/config.js';
import { sleep } from '../utils/helpers.js';

export async function fetchJupiterQuote({
  inputMint,
  outputMint,
  amount,
  slippageBps,
}: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
}): Promise<{ parsed: JupiterQuote | null; raw: any }> {
  // Real Jupiter quote fetching with logging and error handling
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  const quoteTimestamp = new Date().toISOString();
  try {
    console.log(`[JupiterQuote] Fetching quote at ${quoteTimestamp}: ${url}`);
    const res = await axios.get(url);
    console.log(`[JupiterQuote] Success at ${quoteTimestamp}`);
    return parseJupiterQuote(res.data);
  } catch (e: any) {
    if (e?.response?.status === 429 || /rate.?limit/i.test(e?.message || '')) {
      console.warn(`[JupiterQuote] Rate limit at ${quoteTimestamp} (HTTP 429 or rate limit):`, e?.message || e);
    } else {
      console.error(`[JupiterQuote] Error at ${quoteTimestamp}:`, e);
    }
    return { parsed: null, raw: null };
  }
}

/**
 * Helper for repeated polling with interval/backoff on rate limit
 */
export async function getJupiterQuoteWithBackoff(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
  minIntervalMs?: number;
  maxBackoffMs?: number;
  maxAttempts?: number;
  bypassCooldown?: boolean; // For manual trigger
}): Promise<{ parsed: JupiterQuote | null; raw: any }> {
  const minInterval = params.minIntervalMs ?? (config.apis?.jupiterQuoteIntervalMs || config.tokenMonitor?.pollingIntervalSeconds * 1000 || 1000);
  const maxBackoff = params.maxBackoffMs ?? 60000;
  let interval = minInterval;
  let attempt = 0;
  let lastError: any = null;
  let consecutive429s = 0;
  let cooldownUntil = 0;

  while (!params.maxAttempts || attempt < params.maxAttempts) {
    attempt++;
    // Aggressive cooldown: after 5 consecutive 429s, pause for 30min
    const now = Date.now();
    if (!params.bypassCooldown && cooldownUntil > now) {
      const waitMs = cooldownUntil - now;
      console.warn(`[JupiterQuote] In cooldown for ${Math.ceil(waitMs/1000)}s due to repeated 429s (until ${new Date(cooldownUntil).toISOString()})`);
      await sleep(waitMs);
      continue;
    }
    const result = await fetchJupiterQuote(params);
    if (result.parsed) {
      if (interval !== minInterval) {
        console.log(`[JupiterQuote] Backoff reset to default interval (${minInterval}ms)`);
      }
      interval = minInterval;
      consecutive429s = 0;
      return result;
    }
    // If rate limit, backoff and track
    if (lastError?.response?.status === 429 || /rate.?limit/i.test(lastError?.message || '')) {
      consecutive429s++;
      interval = Math.min(interval * 2, maxBackoff);
      console.warn(`[JupiterQuote] Rate limit/backoff: attempt ${attempt}, 429s=${consecutive429s}, next in ${interval}ms`);
      if (consecutive429s >= 5) {
        cooldownUntil = Date.now() + 1800000; // 30min
        console.error(`[JupiterQuote] Entering cooldown mode for 30min after 5 consecutive 429s at ${new Date().toISOString()}`);
      }
    } else {
      interval = minInterval;
      consecutive429s = 0;
      console.warn(`[JupiterQuote] Error: attempt ${attempt}, retrying in ${interval}ms`);
    }
    await sleep(interval);
  }
  return { parsed: null, raw: null };
}


