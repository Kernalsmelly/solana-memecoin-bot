import EventEmitter from 'events';
import WebSocket from 'ws';
import axios from 'axios';
import logger from '../utils/logger.js';
import { fetchTokenMetrics } from '../utils/fetchTokenMetrics.js';
import { scoreOpportunity } from '../utils/opportunityScorer.js';
export class MultiSourceTokenDetector extends EventEmitter {
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
        // PILOT PATCH: Disable Birdeye WebSocket for pilot
        return;
        try {
            this.birdeyeSocket = new WebSocket(this.birdeyeUrl);
            const socket = this.birdeyeSocket;
            if (socket)
                socket.on('open', () => {
                    logger.info('[MultiSourceTokenDetector] Connected to Birdeye WebSocket');
                    // Subscribe to new pools/tokens (Birdeye docs may require a subscription message)
                    // this.birdeyeSocket.send(JSON.stringify({ method: 'subscribe', ... }));
                });
            if (socket)
                socket.on('message', (data) => {
                    logger.debug(`[MultiSourceTokenDetector] Birdeye raw message: ${data}`);
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
                                    extra: msg.data,
                                });
                                logger.info(`[MultiSourceTokenDetector] Birdeye detected new token: ${msg.data.mint}`);
                            }
                        }
                    }
                    catch (e) {
                        logger.warn('[MultiSourceTokenDetector] Failed to parse Birdeye message', e);
                    }
                });
            if (socket)
                socket.on('error', (err) => {
                    logger.error('[MultiSourceTokenDetector] Birdeye WebSocket error', err);
                });
            if (socket)
                socket.on('close', () => {
                    logger.warn('[MultiSourceTokenDetector] Birdeye WebSocket closed. Reconnecting in 5s...');
                    setTimeout(() => this.startBirdeye(), 5000);
                });
        }
        catch (e) {
            logger.error('[MultiSourceTokenDetector] Error starting Birdeye WebSocket', e);
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
            const res = await axios.get(this.jupiterUrl);
            const tokens = res.data;
            for (const t of tokens) {
                logger.debug(`[MultiSourceTokenDetector] Jupiter considering token: ${t.address} (${t.symbol || ''})`);
                if (t.address && !this.watchedMints.has(t.address)) {
                    // Score the token before emitting
                    try {
                        const metrics = await fetchTokenMetrics(t.address);
                        if (!metrics)
                            continue;
                        const { score, reasons } = scoreOpportunity(metrics ??
                            {
                            /* default TokenMetrics */
                            });
                        logger.info(`[MultiSourceTokenDetector] Scored ${metrics?.symbol || t.symbol} (${t.address}): ${score} [${reasons.join(', ')}]`);
                        if (score >= 50) {
                            this.watchedMints.add(t.address);
                            this.emit('newTokenDetected', {
                                mint: t.address,
                                symbol: t.symbol,
                                poolAddress: undefined,
                                source: 'jupiter',
                                metrics,
                                extra: t,
                            });
                            logger.info(`[MultiSourceTokenDetector] Jupiter detected new token: ${t.address}`);
                        }
                        else {
                            logger.debug(`[MultiSourceTokenDetector] Skipping ${metrics?.symbol || t.symbol} (${t.address}) due to low score (${score})`);
                        }
                    }
                    catch (err) {
                        if (err instanceof Error) {
                            logger.warn(`[MultiSourceTokenDetector] Error scoring token ${t.address}: ${err.message}`);
                        }
                        else {
                            logger.warn(`[MultiSourceTokenDetector] Error scoring token ${t.address}: ${String(err)}`);
                        }
                    }
                }
            }
        }
        catch (e) {
            logger.warn('[MultiSourceTokenDetector] Jupiter polling error', e);
        }
    }
    async pollDexscreener() {
        // PILOT PATCH: Disable Dexscreener polling for pilot
        return [];
        try {
            const res = await axios.get(this.dexscreenerUrl);
            const tokens = res.data?.tokens || [];
            for (const t of tokens) {
                logger.debug(`[MultiSourceTokenDetector] Dexscreener considering token: ${t.address} (${t.symbol || ''})`);
                if (t.address && !this.watchedMints.has(t.address)) {
                    // Score the token before emitting
                    try {
                        const metrics = await fetchTokenMetrics(t.address);
                        if (!metrics)
                            continue;
                        const { score, reasons } = scoreOpportunity(metrics ??
                            {
                            /* default TokenMetrics */
                            });
                        logger.info(`[MultiSourceTokenDetector] Scored ${metrics?.symbol || t.symbol} (${t.address}): ${score} [${reasons.join(', ')}]`);
                        if (score >= 50) {
                            this.watchedMints.add(t.address);
                            this.emit('newTokenDetected', {
                                mint: t.address,
                                symbol: t.symbol,
                                poolAddress: undefined,
                                source: 'dexscreener',
                                metrics,
                                extra: t,
                            });
                            logger.info(`[MultiSourceTokenDetector] Dexscreener detected new token: ${t.address}`);
                        }
                        else {
                            logger.debug(`[MultiSourceTokenDetector] Skipping ${metrics?.symbol || t.symbol} (${t.address}) due to low score (${score})`);
                        }
                    }
                    catch (err) {
                        if (err instanceof Error) {
                            logger.warn(`[MultiSourceTokenDetector] Error scoring token ${t.address}: ${err.message}`);
                        }
                        else {
                            logger.warn(`[MultiSourceTokenDetector] Error scoring token ${t.address}: ${String(err)}`);
                        }
                    }
                }
            }
        }
        catch (e) {
            logger.warn('[MultiSourceTokenDetector] Dexscreener polling error', e);
        }
    }
}
//# sourceMappingURL=multiSourceTokenDetector.js.map