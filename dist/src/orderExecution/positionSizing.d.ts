export interface PositionSizingParams {
    volatility: number;
    balance: number;
    maxTradeSize: number;
    riskPct: number;
    poolLiquidityUsd: number;
    maxExposureUsd: number;
    solPrice: number;
}
export declare function computePositionSize(params: PositionSizingParams): number;
//# sourceMappingURL=positionSizing.d.ts.map