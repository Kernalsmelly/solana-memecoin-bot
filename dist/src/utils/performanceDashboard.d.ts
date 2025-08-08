import { RiskManager } from '../live/riskManager.js';
interface DashboardOptions {
    port: number;
    riskManager: RiskManager;
    dataDir?: string;
    refreshInterval?: number;
}
export declare class PerformanceDashboard {
    patternEventCounts: Record<string, number>;
    pendingExits: any[];
    private app;
    private server;
    private riskManager;
    private port;
    private dataDir;
    private refreshInterval;
    private performanceHistory;
    private tradeHistory;
    private pnlSeries;
    constructor(options: DashboardOptions);
    private setupRoutes;
    start(): Promise<void>;
    stop(): Promise<void>;
    private startMetricsCollection;
    private savePerformanceData;
}
export default PerformanceDashboard;
//# sourceMappingURL=performanceDashboard.d.ts.map