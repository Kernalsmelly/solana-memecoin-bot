import { Connection } from '@solana/web3.js';
import { Position, RiskMetrics } from './types';
export declare class TradingSystem {
    private connection;
    private orderExecution;
    private contractValidator;
    private tokenMonitor;
    private persistenceManager;
    private state;
    constructor(connection: Connection);
    private setupEventListeners;
    private handleNewToken;
    private handleTokenUpdate;
    private handlePatternDetected;
    private handleError;
    private executeSignal;
    private calculatePositionSize;
    private canOpenPosition;
    private updatePosition;
    private closePosition;
    private updateRiskMetrics;
    private calculateDrawdown;
    private calculateWinRate;
    getPosition(tokenAddress: string): Position | undefined;
    getAllPositions(): Position[];
    getActivePositions(): Position[];
    getRiskMetrics(): RiskMetrics;
    start(): void;
    stop(): void;
}
//# sourceMappingURL=tradingSystem.d.ts.map