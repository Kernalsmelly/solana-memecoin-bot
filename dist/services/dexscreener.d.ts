export interface DexscreenerPoolData {
    liquidityUsd?: number;
    volume24hUsd?: number;
    tokenName?: string;
    tokenSymbol?: string;
    tokenDecimals?: number;
}
export declare function fetchDexscreenerPoolData(baseMint: string, quoteMint: string): Promise<DexscreenerPoolData | null>;
//# sourceMappingURL=dexscreener.d.ts.map