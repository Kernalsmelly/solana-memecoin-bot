import axios from 'axios';
import logger from '../utils/logger';
import { tradeLogger } from '../utils/tradeLogger';
import { fetchTokenMetrics } from '../utils/fetchTokenMetrics';
import { PatternDetector } from '../strategy/patternDetector';
import { scoreOpportunity } from '../utils/opportunityScorer';
import { persistOpportunity } from '../utils/persistence';

// Configurable: how many tokens to scan, and how often (ms)
const TOP_N = Number(process.env.TOP_TOKEN_COUNT || 50);
const SCAN_INTERVAL_MS = Number(process.env.TOP_TOKEN_SCAN_INTERVAL_MS || 10 * 60 * 1000); // 10 minutes by default

export class TopTokenScanner {
  private patternDetector: PatternDetector;
  private running: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(patternDetector: PatternDetector) {
    this.patternDetector = patternDetector;
  }

  public start() {
    if (this.running) return;
    this.running = true;
    logger.info(`[TopTokenScanner] Starting background scan for top ${TOP_N} tokens every ${SCAN_INTERVAL_MS / 60000} minutes.`);
    this.scanLoop();
  }

  public stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private async scanLoop() {
    while (this.running) {
      try {
        let tokens: any[] = []; // Explicitly typed for clarity
        let source = 'Birdeye';
        try {
          logger.info('[TopTokenScanner] Fetching top tokens from Birdeye...');
          const url = `https://public-api.birdeye.so/public/tokenlist?sort_by=volume_24h&sort_type=desc&offset=0&limit=${TOP_N}`;
          const resp = await axios.get(url, { timeout: 10000 });
          tokens = resp.data?.data?.tokens || [];
        } catch (e) {
  if (e instanceof Error) {
    logger.warn('[TopTokenScanner] Error:', e.message);
  } else {
    logger.warn('[TopTokenScanner] Error:', String(e));
  }

          try {
            // Dexscreener free endpoint for Solana pairs
            const url = 'https://api.dexscreener.com/latest/dex/pairs/solana';
            const resp = await axios.get(url, { timeout: 10000 });
            // Sort by 24h volume descending and take top N
            tokens = (resp.data?.pairs || []).sort((a: any, b: any) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0)).slice(0, TOP_N);
            source = 'Dexscreener';
          } catch (dsErr) {
            tokens = [];
          }
        }
        for (const t of tokens) {
          try {
            const metrics = await fetchTokenMetrics(t.address);
            if (!metrics || !metrics.priceUsd || !metrics.liquidity) continue;
            const { score, reasons } = scoreOpportunity(metrics);
            // Persist opportunity with required fields: source, address, symbol, score, reasons, metrics
await persistOpportunity({
  source,
  address: metrics.address,
  symbol: metrics.symbol || t.symbol,
  score,
  reasons,
  metrics
});
            if (score >= 50) {
              this.patternDetector.analyzeTokenForPattern(metrics);
            } else {
            }
          } catch (e) {
  if (e instanceof Error) {
    logger.warn('[TopTokenScanner] Error:', e.message);
  } else {
    logger.warn('[TopTokenScanner] Error:', String(e));
  }

            tradeLogger.logScenario('TOP_TOKEN_SCANNER_ERROR', {
              event: 'scanLoop-processToken',
              token: (t && (t.symbol ?? t.address ?? 'UNKNOWN')),
              error: e && (e instanceof Error ? e.message : String(e)),
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (e) {
  if (e instanceof Error) {
    logger.warn('[TopTokenScanner] Error:', e.message);
  } else {
    logger.warn('[TopTokenScanner] Error:', String(e));
  }

      }
      // Wait for next scan
      await new Promise(res => this.timer = setTimeout(res, SCAN_INTERVAL_MS));
    }
  }
}
