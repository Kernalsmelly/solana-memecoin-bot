export function computePnLSummary(fills) {
    let pnl = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let wins = 0;
    let losses = 0;
    for (const fill of fills) {
        // For dry-run, treat each fill as a round-trip (buy then sell at same price)
        // If you have paired fills, you can compute real PnL
        // Here, we just count number of fills and simulate PnL as zero
        // Extend this logic for real PnL tracking
        if (fill.action === 'sell') {
            // Example: PnL = (sell - buy) * qty
            // Here, just simulate zero
            pnl += 0;
            if (0 > 0)
                wins++;
            else
                losses++;
        }
        peak = Math.max(peak, pnl);
        maxDrawdown = Math.max(maxDrawdown, peak - pnl);
    }
    return { totalPnL: pnl, maxDrawdown, wins, losses };
}
//# sourceMappingURL=pnlStats.js.map