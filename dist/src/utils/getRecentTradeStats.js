"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentTradeStats = getRecentTradeStats;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.resolve(process.cwd(), 'data');
/**
 * Get recent trade stats for analytics/summary notifications.
 * @param windowMs Time window in ms
 * @returns {
 *   realizedPnl: number,
 *   winCount: number,
 *   lossCount: number,
 *   avgPnl: number,
 *   tradeCount: number,
 *   trades: any[],
 *   topWinner?: { symbol: string, pnl: number, time: number },
 *   topLoser?: { symbol: string, pnl: number, time: number },
 *   mostTraded?: { symbol: string, count: number },
 *   pnlBuckets: { gt10: number, p0to10: number, n0to10: number, lt10: number }
 * }
 */
async function getRecentTradeStats(windowMs) {
    const TRADES_FILE = path_1.default.join(DATA_DIR, 'trades.jsonl');
    const now = Date.now();
    let realizedPnl = 0;
    let winCount = 0;
    let lossCount = 0;
    let tradeCount = 0;
    let pnlSum = 0;
    let trades = [];
    try {
        if (!fs_1.default.existsSync(TRADES_FILE))
            return { realizedPnl: 0, winCount: 0, lossCount: 0, avgPnl: 0, tradeCount: 0 };
        const lines = (await fs_1.default.promises.readFile(TRADES_FILE, 'utf8')).split('\n').filter(Boolean);
        for (const line of lines) {
            try {
                const trade = JSON.parse(line);
                // Only consider closed trades within the window
                if (trade.timestamp && now - trade.timestamp <= windowMs && trade.type === 'close') {
                    tradeCount++;
                    const pnl = typeof trade.pnl === 'number' ? trade.pnl : 0;
                    pnlSum += pnl;
                    realizedPnl += pnl;
                    if (pnl > 0)
                        winCount++;
                    else if (pnl < 0)
                        lossCount++;
                    trades.push(trade);
                }
            }
            catch { }
        }
        const avgPnl = tradeCount > 0 ? pnlSum / tradeCount : 0;
        // Top winner/loser
        let topWinner = null;
        let topLoser = null;
        if (trades.length > 0) {
            topWinner = trades.reduce((max, t) => (t.pnl > (max?.pnl ?? -Infinity) ? t : max), null);
            topLoser = trades.reduce((min, t) => (t.pnl < (min?.pnl ?? Infinity) ? t : min), null);
            if (topWinner)
                topWinner = { symbol: topWinner.tokenSymbol || topWinner.token || 'UNKNOWN', pnl: topWinner.pnl, time: topWinner.timestamp };
            if (topLoser)
                topLoser = { symbol: topLoser.tokenSymbol || topLoser.token || 'UNKNOWN', pnl: topLoser.pnl, time: topLoser.timestamp };
        }
        // Most traded token
        let mostTraded = null;
        if (trades.length > 0) {
            const freq = {};
            for (const t of trades) {
                const sym = t.tokenSymbol || t.token || 'UNKNOWN';
                freq[sym] = (freq[sym] || 0) + 1;
            }
            const maxSym = Object.entries(freq).reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0]);
            if (maxSym[1] > 0)
                mostTraded = { symbol: maxSym[0], count: maxSym[1] };
        }
        // PnL buckets
        let gt10 = 0, p0to10 = 0, n0to10 = 0, lt10 = 0;
        for (const t of trades) {
            if (typeof t.pnl !== 'number')
                continue;
            if (t.pnl > 10)
                gt10++;
            else if (t.pnl > 0)
                p0to10++;
            else if (t.pnl > -10)
                n0to10++;
            else
                lt10++;
        }
        const pnlBuckets = { gt10, p0to10, n0to10, lt10 };
        return { realizedPnl, winCount, lossCount, avgPnl, tradeCount, trades, topWinner, topLoser, mostTraded, pnlBuckets };
    }
    catch (err) {
        console.error('[Persistence] Failed to read trades.jsonl for stats:', err);
        return { realizedPnl: 0, winCount: 0, lossCount: 0, avgPnl: 0, tradeCount: 0 };
    }
}
//# sourceMappingURL=getRecentTradeStats.js.map