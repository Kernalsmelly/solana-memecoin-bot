import axios from 'axios';
import logger from '../utils/logger.js';
import { tradeLogger } from '../utils/tradeLogger.js';
import { fetchTokenMetrics } from '../utils/fetchTokenMetrics.js';
import { scoreOpportunity } from '../utils/opportunityScorer.js';
import { persistOpportunity } from '../utils/persistence.js';
// Configurable: how many tokens to scan, and how often (ms)
const TOP_N = Number(process.env.TOP_TOKEN_COUNT || 50);
const SCAN_INTERVAL_MS = Number(process.env.TOP_TOKEN_SCAN_INTERVAL_MS || 10 * 60 * 1000); // 10 minutes by default
export class TopTokenScanner {
    patternDetector;
    running = false;
    timer = null;
    constructor(patternDetector) {
        this.patternDetector = patternDetector;
    }
    start() {
        if (this.running)
            return;
        this.running = true;
        logger.info(`[TopTokenScanner] Starting background scan for top ${TOP_N} tokens every ${SCAN_INTERVAL_MS / 60000} minutes.`);
        this.scanLoop();
    }
    stop() {
        this.running = false;
        if (this.timer)
            clearTimeout(this.timer);
    }
    async scanLoop() {
        while (this.running) {
            try {
                let tokens = [];
                let source = 'Birdeye';
                try {
                    // PILOT PATCH: Use static mock token list
                    tokens = [
                        { address: 'MOCK1', symbol: 'MOCK1', volume24h: 10000 },
                        { address: 'MOCK2', symbol: 'MOCK2', volume24h: 9000 },
                        { address: 'MOCK3', symbol: 'MOCK3', volume24h: 8000 },
                    ];
                }
                catch (e) {
                    logger.warn('[TopTokenScanner] Error fetching mock tokens:', e instanceof Error ? e.message : String(e));
                    try {
                        // Dexscreener free endpoint for Solana pairs
                        const url = 'https://api.dexscreener.com/latest/dex/pairs/solana';
                        const resp = await axios.get(url, { timeout: 10000 });
                        // Sort by 24h volume descending and take top N
                        tokens = (resp.data?.pairs || [])
                            .sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))
                            .slice(0, TOP_N);
                        source = 'Dexscreener';
                    }
                    catch (dsErr) {
                        logger.warn('[TopTokenScanner] Error fetching Dexscreener data:', dsErr instanceof Error ? dsErr.message : String(dsErr));
                        tokens = [];
                    }
                }
                for (const t of tokens) {
                    try {
                        const metrics = await fetchTokenMetrics(t.address);
                        if (!metrics || !metrics.priceUsd || !metrics.liquidity)
                            continue;
                        const { score, reasons } = scoreOpportunity(metrics);
                        await persistOpportunity({
                            source,
                            address: metrics.address,
                            symbol: metrics.symbol || t.symbol,
                            score,
                            reasons,
                            metrics,
                        });
                        if (score >= 50) {
                            this.patternDetector.analyzeTokenForPattern(metrics);
                        }
                    }
                    catch (e) {
                        logger.warn('[TopTokenScanner] Error processing token:', e instanceof Error ? e.message : String(e));
                        tradeLogger.logScenario('TOP_TOKEN_SCANNER_ERROR', {
                            event: 'scanLoop-processToken',
                            token: t.symbol ?? t.address ?? 'UNKNOWN',
                            error: e instanceof Error ? e.message : String(e),
                            timestamp: new Date().toISOString(),
                        });
                    }
                }
            }
            catch (e) {
                logger.error('[TopTokenScanner] Critical error in scan loop:', e instanceof Error ? e.message : String(e));
            }
            // Wait for next scan
            await new Promise((res) => (this.timer = setTimeout(res, SCAN_INTERVAL_MS)));
        }
    }
}
//# sourceMappingURL=topTokenScanner.js.map