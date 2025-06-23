"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopTokenScanner = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const tradeLogger_1 = require("../utils/tradeLogger");
const fetchTokenMetrics_1 = require("../utils/fetchTokenMetrics");
const opportunityScorer_1 = require("../utils/opportunityScorer");
const persistence_1 = require("../utils/persistence");
// Configurable: how many tokens to scan, and how often (ms)
const TOP_N = Number(process.env.TOP_TOKEN_COUNT || 50);
const SCAN_INTERVAL_MS = Number(process.env.TOP_TOKEN_SCAN_INTERVAL_MS || 10 * 60 * 1000); // 10 minutes by default
class TopTokenScanner {
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
        logger_1.default.info(`[TopTokenScanner] Starting background scan for top ${TOP_N} tokens every ${SCAN_INTERVAL_MS / 60000} minutes.`);
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
                let tokens = []; // Explicitly typed for clarity
                let source = 'Birdeye';
                try {
                    logger_1.default.info('[TopTokenScanner] Fetching top tokens from Birdeye...');
                    const url = `https://public-api.birdeye.so/public/tokenlist?sort_by=volume_24h&sort_type=desc&offset=0&limit=${TOP_N}`;
                    const resp = await axios_1.default.get(url, { timeout: 10000 });
                    tokens = resp.data?.data?.tokens || [];
                }
                catch (e) {
                    if (e instanceof Error) {
                        logger_1.default.warn('[TopTokenScanner] Error:', e.message);
                    }
                    else {
                        logger_1.default.warn('[TopTokenScanner] Error:', String(e));
                    }
                    try {
                        // Dexscreener free endpoint for Solana pairs
                        const url = 'https://api.dexscreener.com/latest/dex/pairs/solana';
                        const resp = await axios_1.default.get(url, { timeout: 10000 });
                        // Sort by 24h volume descending and take top N
                        tokens = (resp.data?.pairs || []).sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0)).slice(0, TOP_N);
                        source = 'Dexscreener';
                    }
                    catch (dsErr) {
                        tokens = [];
                    }
                }
                for (const t of tokens) {
                    try {
                        const metrics = await (0, fetchTokenMetrics_1.fetchTokenMetrics)(t.address);
                        if (!metrics || !metrics.priceUsd || !metrics.liquidity)
                            continue;
                        const { score, reasons } = (0, opportunityScorer_1.scoreOpportunity)(metrics);
                        // Persist opportunity with required fields: source, address, symbol, score, reasons, metrics
                        await (0, persistence_1.persistOpportunity)({
                            source,
                            address: metrics.address,
                            symbol: metrics.symbol || t.symbol,
                            score,
                            reasons,
                            metrics
                        });
                        if (score >= 50) {
                            this.patternDetector.analyzeTokenForPattern(metrics);
                        }
                        else {
                        }
                    }
                    catch (e) {
                        if (e instanceof Error) {
                            logger_1.default.warn('[TopTokenScanner] Error:', e.message);
                        }
                        else {
                            logger_1.default.warn('[TopTokenScanner] Error:', String(e));
                        }
                        tradeLogger_1.tradeLogger.logScenario('TOP_TOKEN_SCANNER_ERROR', {
                            event: 'scanLoop-processToken',
                            token: (t && (t.symbol ?? t.address ?? 'UNKNOWN')),
                            error: e && (e instanceof Error ? e.message : String(e)),
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
            catch (e) {
                if (e instanceof Error) {
                    logger_1.default.warn('[TopTokenScanner] Error:', e.message);
                }
                else {
                    logger_1.default.warn('[TopTokenScanner] Error:', String(e));
                }
            }
            // Wait for next scan
            await new Promise(res => this.timer = setTimeout(res, SCAN_INTERVAL_MS));
        }
    }
}
exports.TopTokenScanner = TopTokenScanner;
//# sourceMappingURL=topTokenScanner.js.map