import { RiskManager } from './riskManager';
import { NotificationManager } from './notificationManager';
/**
 * Starts a lightweight metrics server exposing /metrics for Prometheus scraping.
 * Exposes basic bot health and risk metrics.
 */
export declare function startMetricsServer(riskManager: RiskManager, notificationManager: NotificationManager, port?: number): void;
//# sourceMappingURL=metricsServer.d.ts.map