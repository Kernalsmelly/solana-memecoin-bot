export type DataResult = {
    priceUSD: number | null;
    liquidityUSD: number | null;
    fdvUSD: number | null;
    volume24hUSD: number | null;
    lastTradeTs: number | null;
};
export declare class DataBroker {
    static getTokenData(address: string): Promise<DataResult>;
}
//# sourceMappingURL=DataBroker.d.ts.map