import { Connection } from '@solana/web3.js';
import { Position } from './types';
export declare class TradingSystem {
    private strategyCoordinator;
    private latestPatterns;
    private connection;
    private orderExecution;
    private contractValidator;
    private tokenMonitor;
    private persistenceManager;
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
    getRiskMetrics(): {};
    start(): void;
    stop(): void;
}
//# sourceMappingURL=tradingSystem.d.ts.map