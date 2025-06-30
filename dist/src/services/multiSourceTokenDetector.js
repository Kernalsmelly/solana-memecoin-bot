"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiSourceTokenDetector = void 0;
const events_1 = __importDefault(require("events"));
const ws_1 = __importDefault(require("ws"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const fetchTokenMetrics_1 = require("../utils/fetchTokenMetrics");
const opportunityScorer_1 = require("../utils/opportunityScorer");
class MultiSourceTokenDetector extends events_1.default {
    birdeyeSocket = null;
    birdeyeUrl = 'wss://ws.birdeye.so/';
    jupiterUrl = 'https://quote-api.jup.ag/v6/tokens';
    dexscreenerUrl = 'https://api.dexscreener.com/latest/dex/tokens/solana';
    pollIntervalMs = 2 * 60 * 1000; // 2 minutes
    watchedMints = new Set();
    constructor() {
        super();
        this.startBirdeye();
        this.startPolling();
    }
    startBirdeye() {
        try {
            this.birdeyeSocket = new ws_1.default(this.birdeyeUrl);
            this.birdeyeSocket.on('open', () => {
                logger_1.default.info('[MultiSourceTokenDetector] Connected to Birdeye WebSocket');
                // Subscribe to new pools/tokens (Birdeye docs may require a subscription message)
                // this.birdeyeSocket.send(JSON.stringify({ method: 'subscribe', ... }));
            });
            this.birdeyeSocket.on('message', (data) => {
                logger_1.default.debug(`[MultiSourceTokenDetector] Birdeye raw message: ${data}`);
                try {
                    const msg = JSON.parse(data);
                    // Adjust this logic based on Birdeye's docs for new pool/token events
                    if (msg.type === 'new_pool' && msg.data?.mint) {
                        if (!this.watchedMints.has(msg.data.mint)) {
                            this.watchedMints.add(msg.data.mint);
                            this.emit('newTokenDetected', {
                                mint: msg.data.mint,
                                symbol: msg.data.symbol,
                                poolAddress: msg.data.poolAddress,
                                source: 'birdeye',
                                extra: msg.data
                            });
                            logger_1.default.info(`[MultiSourceTokenDetector] Birdeye detected new token: ${msg.data.mint}`);
                        }
                    }
                }
                catch (e) {
                    logger_1.default.warn('[MultiSourceTokenDetector] Failed to parse Birdeye message', e);
                }
            });
            this.birdeyeSocket.on('error', (err) => {
                logger_1.default.error('[MultiSourceTokenDetector] Birdeye WebSocket error', err);
            });
            this.birdeyeSocket.on('close', () => {
                logger_1.default.warn('[MultiSourceTokenDetector] Birdeye WebSocket closed. Reconnecting in 5s...');
                setTimeout(() => this.startBirdeye(), 5000);
            });
        }
        catch (e) {
            logger_1.default.error('[MultiSourceTokenDetector] Error starting Birdeye WebSocket', e);
        }
    }
    startPolling() {
        setInterval(async () => {
            await this.pollJupiter();
            await this.pollDexscreener();
        }, this.pollIntervalMs);
        // Initial poll
        this.pollJupiter();
        this.pollDexscreener();
    }
    async pollJupiter() {
        try {
            const res = await axios_1.default.get(this.jupiterUrl);
            const tokens = res.data;
            for (const t of tokens) {
                logger_1.default.debug(`[MultiSourceTokenDetector] Jupiter considering token: ${t.address} (${t.symbol || ''})`);
                if (t.address && !this.watchedMints.has(t.address)) {
                    // Score the token before emitting
                    try {
                        const metrics = await (0, fetchTokenMetrics_1.fetchTokenMetrics)(t.address);
                        if (!metrics)
                            continue;
                        const { score, reasons } = (0, opportunityScorer_1.scoreOpportunity)(metrics);
                        logger_1.default.info(`[MultiSourceTokenDetector] Scored ${metrics.symbol || t.symbol} (${t.address}): ${score} [${reasons.join(', ')}]`);
                        if (score >= 50) {
                            this.watchedMints.add(t.address);
                            this.emit('newTokenDetected', {
                                mint: t.address,
                                symbol: t.symbol,
                                poolAddress: undefined,
                                source: 'jupiter',
                                metrics,
                                extra: t
                            });
                            logger_1.default.info(`[MultiSourceTokenDetector] Jupiter detected new token: ${t.address}`);
                        }
                        else {
                            logger_1.default.debug(`[MultiSourceTokenDetector] Skipping ${metrics.symbol || t.symbol} (${t.address}) due to low score (${score})`);
                        }
                    }
                    catch (err) {
                        if (err instanceof Error) {
                            logger_1.default.warn(`[MultiSourceTokenDetector] Error scoring token ${t.address}: ${err.message}`);
                        }
                        else {
                            logger_1.default.warn(`[MultiSourceTokenDetector] Error scoring token ${t.address}: ${String(err)}`);
                        }
                    }
                }
            }
        }
        catch (e) {
            logger_1.default.warn('[MultiSourceTokenDetector] Jupiter polling error', e);
        }
    }
    async pollDexscreener() {
        try {
            const res = await axios_1.default.get(this.dexscreenerUrl);
            const tokens = res.data?.tokens || [];
            for (const t of tokens) {
                logger_1.default.debug(`[MultiSourceTokenDetector] Dexscreener considering token: ${t.address} (${t.symbol || ''})`);
                if (t.address && !this.watchedMints.has(t.address)) {
                    // Score the token before emitting
                    try {
                        const metrics = await (0, fetchTokenMetrics_1.fetchTokenMetrics)(t.address);
                        if (!metrics)
                            continue;
                        const { score, reasons } = (0, opportunityScorer_1.scoreOpportunity)(metrics);
                        logger_1.default.info(`[MultiSourceTokenDetector] Scored ${metrics.symbol || t.symbol} (${t.address}): ${score} [${reasons.join(', ')}]`);
                        if (score >= 50) {
                            this.watchedMints.add(t.address);
                            this.emit('newTokenDetected', {
                                mint: t.address,
                                symbol: t.symbol,
                                poolAddress: undefined,
                                source: 'dexscreener',
                                metrics,
                                extra: t
                            });
                            logger_1.default.info(`[MultiSourceTokenDetector] Dexscreener detected new token: ${t.address}`);
                        }
                        else {
                            logger_1.default.debug(`[MultiSourceTokenDetector] Skipping ${metrics.symbol || t.symbol} (${t.address}) due to low score (${score})`);
                        }
                    }
                    catch (err) {
                        if (err instanceof Error) {
                            logger_1.default.warn(`[MultiSourceTokenDetector] Error scoring token ${t.address}: ${err.message}`);
                        }
                        else {
                            logger_1.default.warn(`[MultiSourceTokenDetector] Error scoring token ${t.address}: ${String(err)}`);
                        }
                    }
                }
            }
        }
        catch (e) {
            logger_1.default.warn('[MultiSourceTokenDetector] Dexscreener polling error', e);
        }
    }
}
exports.MultiSourceTokenDetector = MultiSourceTokenDetector;
//# sourceMappingURL=multiSourceTokenDetector.js.map