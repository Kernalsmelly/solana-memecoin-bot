import express from 'express';
import { RiskManager } from './riskManager';
import { NotificationManager } from './notificationManager';

/**
 * Starts a lightweight metrics server exposing /metrics for Prometheus scraping.
 * Exposes basic bot health and risk metrics.
 */
export function startMetricsServer(riskManager: RiskManager, notificationManager: NotificationManager, port = 9469) {
  const app = express();

  let parameterUpdatesTotal = 0;
  // Expose a method to increment the counter from outside
  (app as any).incrementParameterUpdates = () => { parameterUpdatesTotal++; };

  app.get('/metrics', (req, res) => {
    const metrics = riskManager.getMetrics();
    // Prometheus exposition format
    let output = '';
    // Per-strategy metrics
    if (metrics.strategies) {
      for (const [strategy, s] of Object.entries(metrics.strategies)) {
        output += `trades_total{strategy="${strategy}"} ${s.tradesTotal ?? 0}\n`;
        output += `net_pnl{strategy="${strategy}"} ${s.netPnl ?? 0}\n`;
        output += `win_rate{strategy="${strategy}"} ${s.winRate ?? 0}\n`;
      }
    }
    output += `bot_balance ${metrics.currentBalance}\n`;
    output += `bot_drawdown ${metrics.drawdown}\n`;
    output += `bot_daily_pnl ${metrics.dailyPnL}\n`;
    output += `bot_win_rate ${metrics.winRate}\n`;
    output += `bot_active_positions ${metrics.activePositions}\n`;
    output += `bot_available_positions ${metrics.availablePositions}\n`;
    output += `bot_high_water_mark ${metrics.highWaterMark}\n`;
    output += `bot_daily_loss ${metrics.dailyLoss}\n`;
    if (typeof metrics.totalFeesPaid === 'number') output += `bot_total_fees_paid ${metrics.totalFeesPaid}\n`;
    if (typeof metrics.totalSlippagePaid === 'number') output += `bot_total_slippage_paid ${metrics.totalSlippagePaid}\n`;
    // Average slippage bps: (totalSlippagePaid / totalNotionalTraded) * 10,000
    if (typeof metrics.totalSlippagePaid === 'number' && typeof metrics.totalNotionalTraded === 'number' && metrics.totalNotionalTraded > 0) {
      const avgSlippageBps = (metrics.totalSlippagePaid / metrics.totalNotionalTraded) * 10000;
      output += `bot_avg_slippage_bps ${avgSlippageBps}\n`;
    }
    // Net PnL after costs: currentBalance - initialBalance
    if (typeof metrics.currentBalance === 'number' && typeof metrics.initialBalance === 'number') {
      const netPnlAfterCosts = metrics.currentBalance - metrics.initialBalance;
      output += `bot_net_pnl_after_costs ${netPnlAfterCosts}\n`;
    }
    output += `bot_emergency_stop ${metrics.emergencyStopActive ? 1 : 0}\n`;
    output += `bot_system_enabled ${metrics.systemEnabled ? 1 : 0}\n`;
    output += `parameter_updates_total ${parameterUpdatesTotal}\n`;
    res.set('Content-Type', 'text/plain');
    res.send(output);
  });

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[MetricsServer] Listening on :${port}/metrics`);
  });
}
