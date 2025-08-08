export function computePositionSize(params) {
    const { volatility, balance, maxTradeSize, riskPct, poolLiquidityUsd, maxExposureUsd, solPrice } = params;
    if (!volatility || volatility <= 0)
        return 0;
    let sizeSOL = Math.min(maxTradeSize, (riskPct * balance) / volatility);
    // Cap by pool liquidity (e.g. never > 10% of pool)
    const maxByLiquidity = (poolLiquidityUsd / solPrice) * 0.1;
    sizeSOL = Math.min(sizeSOL, maxByLiquidity);
    // Cap by global max exposure
    const maxByExposure = maxExposureUsd / solPrice;
    sizeSOL = Math.min(sizeSOL, maxByExposure);
    return Math.max(0, sizeSOL);
}
//# sourceMappingURL=positionSizing.js.map