import { RiskManager } from './riskManager.js';
import { NotificationManager } from './notificationManager.js';
/**
 * Starts a lightweight metrics server exposing /metrics for Prometheus scraping.
 * Exposes basic bot health and risk metrics.
 */
export declare function startMetricsServer(riskManager: RiskManager, notificationManager: NotificationManager, port?: number): void;
//# sourceMappingURL=metricsServer.d.ts.map