import { getParameterMetrics } from '../utils/selfTuning.js';
/**
 * Express handler to expose parameter tuning metrics at /metrics
 */
export function parameterMetricsHandler(req, res) {
    const metrics = getParameterMetrics();
    let output = '';
    output += `parameter_updates_total ${metrics.parameter_updates_total}\n`;
    if ('stopLossPct' in metrics && metrics.stopLossPct !== undefined)
        output += `stop_loss_pct ${metrics.stopLossPct}\n`;
    if ('takeProfitPct' in metrics && metrics.takeProfitPct !== undefined)
        output += `take_profit_pct ${metrics.takeProfitPct}\n`;
    if ('riskPct' in metrics && metrics.riskPct !== undefined)
        output += `risk_pct ${metrics.riskPct}\n`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(output);
}
//# sourceMappingURL=parameterMetrics.js.map