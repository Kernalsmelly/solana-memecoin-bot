export type PriceHistoryRow = {
    timestamp: number;
    token: string;
    poolAddress?: string;
    price: number;
    liquidity?: number;
    volume?: number;
};
export declare function loadPriceHistory(): PriceHistoryRow[];
export declare function getWindowedPrices(priceHistory: PriceHistoryRow[], token: string, poolAddress: string | undefined, startTime: number, windowMs: number): PriceHistoryRow[];
//# sourceMappingURL=priceHistoryUtils.d.ts.map