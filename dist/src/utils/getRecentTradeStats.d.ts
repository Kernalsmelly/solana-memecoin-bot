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
export declare function getRecentTradeStats(windowMs: number): Promise<{
    realizedPnl: number;
    winCount: number;
    lossCount: number;
    avgPnl: number;
    tradeCount: number;
    trades?: undefined;
    topWinner?: undefined;
    topLoser?: undefined;
    mostTraded?: undefined;
    pnlBuckets?: undefined;
} | {
    realizedPnl: number;
    winCount: number;
    lossCount: number;
    avgPnl: number;
    tradeCount: number;
    trades: any[];
    topWinner: any;
    topLoser: any;
    mostTraded: {
        symbol: string;
        count: number;
    } | null;
    pnlBuckets: {
        gt10: number;
        p0to10: number;
        n0to10: number;
        lt10: number;
    };
}>;
//# sourceMappingURL=getRecentTradeStats.d.ts.map