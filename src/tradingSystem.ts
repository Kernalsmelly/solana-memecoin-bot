// src/tradingSystem.ts

import { Connection, PublicKey } from '@solana/web3.js';
import { Position, TradingSignal, RiskMetrics, TradingState, TradeOrder } from './types';
import { OrderExecution, createOrderExecution } from './orderExecution';
import { ContractValidator, createContractValidator } from './contractValidator';
import { TokenMonitor } from './tokenMonitor';
import { PersistenceManager } from './persistenceManager';
import logger from './utils/logger';

export class TradingSystem {
    private connection: Connection;
    private orderExecution: OrderExecution;
    private contractValidator: ContractValidator;
    private tokenMonitor: TokenMonitor;
    private persistenceManager: PersistenceManager;
    private state: TradingState;

    constructor(connection: Connection) {
        this.connection = connection;
        this.orderExecution = createOrderExecution(connection);
        this.contractValidator = createContractValidator(connection);
        this.tokenMonitor = new TokenMonitor();
        this.persistenceManager = new PersistenceManager();
        this.state = this.persistenceManager.loadState();

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.tokenMonitor.on('newToken', this.handleNewToken.bind(this));
        this.tokenMonitor.on('tokenUpdate', this.handleTokenUpdate.bind(this));
        this.tokenMonitor.on('patternDetected', this.handlePatternDetected.bind(this));
        this.tokenMonitor.on('error', this.handleError.bind(this));
    }

    private async handleNewToken(metrics: any): Promise<void> {
        try {
            // Validate contract
            const analysis = await this.contractValidator.validateContract(metrics.address);
            
            // Skip if high risk
            if (analysis.riskLevel === 'high') {
                logger.info('Skipping high risk token', { address: metrics.address, issues: analysis.issues });
                return;
            }

            // Add to monitor
            await this.tokenMonitor.addToken(metrics);

        } catch (error) {
            logger.error('Error handling new token:', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    private async handleTokenUpdate(metrics: any): Promise<void> {
        try {
            // Update token metrics
            await this.tokenMonitor.updateToken(metrics);

            // Check positions
            const position = this.getPosition(metrics.address);
            if (position) {
                await this.updatePosition(position, metrics.price);
            }

        } catch (error) {
            logger.error('Error handling token update:', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    private async handlePatternDetected(pattern: any): Promise<void> {
        try {
            logger.info('[DEBUG] handlePatternDetected called', { pattern });
            // Generate trading signal
            const signal: TradingSignal = {
                tokenAddress: pattern.tokenAddress,
                price: pattern.metrics.price,
                stopLoss: pattern.metrics.price * 0.95, // 5% stop loss
                positionSize: this.calculatePositionSize(pattern.metrics.liquidity),
                confidence: pattern.confidence,
                timestamp: Date.now(),
                timeframe: '1h',
                signalType: 'buy' // Fixed missing signalType
            };
            logger.info('[DEBUG] TradingSignal generated', { signal });

            // FORCE TRADE: Always execute the signal for debugging
            if (this.canOpenPosition()) {
                logger.info('[DEBUG] Attempting to execute trade', { signal });
                await this.executeSignal(signal);
                logger.info('[DEBUG] Trade execution attempted', { signal });
            } else {
                logger.info('[DEBUG] Cannot open position, skipping trade', { signal });
            }

        } catch (error) {
            logger.error('[DEBUG] Error handling pattern:', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    private handleError(error: Error): void {
        logger.error('Trading system error:', error.message);
    }

    private async executeSignal(signal: TradingSignal): Promise<void> {
        try {
            const order: TradeOrder = {
                tokenAddress: signal.tokenAddress,
                side: 'buy' as const,
                size: signal.positionSize,
                price: signal.price,
                stopLoss: signal.stopLoss,
                timestamp: Date.now()
            };

            const result = await this.orderExecution.executeOrder(order);
            if (result.success) {
                const position: Position = {
                    id: `${signal.tokenAddress}-${Date.now()}`, // Add unique ID
                    tokenAddress: signal.tokenAddress,
                    tokenSymbol: 'UNKNOWN', // Will be updated later
                    tokenMint: new PublicKey(signal.tokenAddress), // Fixed PublicKey type issue
                    tokenDecimals: 9,
                    quantity: signal.positionSize / signal.price,
                    entryPrice: signal.price,
                    currentPrice: signal.price,
                    size: signal.positionSize,
                    stopLoss: signal.stopLoss,
                    takeProfit: signal.price * 1.5, // 50% take profit
                    pnl: 0,
                    status: 'open',
                    timestamp: Date.now()
                };

                this.persistenceManager.savePosition(position);
                this.updateRiskMetrics();
            }
        } catch (error) {
            logger.error('Error executing signal:', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    private calculatePositionSize(liquidity: number): number {
        const maxSize = Math.min(
            this.state.riskMetrics.currentBalance * 0.1, // Max 10% of balance
            liquidity * 0.02 // Max 2% of liquidity
        );
        return Math.min(maxSize, 1000); // Hard cap at $1000
    }

    private canOpenPosition(): boolean {
        return this.state.riskMetrics.activePositions < this.state.riskMetrics.availablePositions;
    }

    private async updatePosition(position: Position, currentPrice: number): Promise<void> {
        try {
            position.currentPrice = currentPrice;
            position.pnl = (currentPrice - position.entryPrice) * position.quantity;

            // Check stop loss
            if (currentPrice <= position.stopLoss) {
                await this.closePosition(position, 'Stop loss hit');
                return;
            }

            // Check take profit
            if (currentPrice >= position.takeProfit) {
                await this.closePosition(position, 'Take profit hit');
                return;
            }

            this.persistenceManager.savePosition(position);

        } catch (error) {
            logger.error('Error updating position:', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    private async closePosition(position: Position, reason: string): Promise<void> {
        try {
            const order: TradeOrder = {
                tokenAddress: position.tokenAddress,
                side: 'sell' as const,
                size: position.size,
                price: position.currentPrice,
                timestamp: Date.now()
            };

            const result = await this.orderExecution.executeOrder(order);
            if (result.success) {
                position.status = 'closed';
                this.persistenceManager.savePosition(position);
                this.updateRiskMetrics();
                
                logger.info('Position closed', {
                    tokenAddress: position.tokenAddress,
                    reason,
                    pnl: position.pnl
                });
            }
        } catch (error) {
            logger.error('Error closing position:', error instanceof Error ? error.message : 'Unknown error');
        }
    }

    private updateRiskMetrics(): void {
        const positions = this.state.positions;
        const activePositions = positions.filter(p => p.status === 'open');
        const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);

        const metrics: RiskMetrics = {
            currentBalance: this.state.riskMetrics.currentBalance + totalPnL,
            dailyPnL: totalPnL,
            drawdown: this.calculateDrawdown(),
            winRate: this.calculateWinRate(),
            activePositions: activePositions.length,
            availablePositions: 3,
            highWaterMark: Math.max(this.state.riskMetrics.highWaterMark, this.state.riskMetrics.currentBalance + totalPnL),
            dailyLoss: Math.min(0, totalPnL)
        };

        this.state.riskMetrics = metrics;
        this.persistenceManager.saveRiskMetrics(metrics);
    }

    private calculateDrawdown(): number {
        return (this.state.riskMetrics.highWaterMark - this.state.riskMetrics.currentBalance) / this.state.riskMetrics.highWaterMark;
    }

    private calculateWinRate(): number {
        const closedPositions = this.state.positions.filter(p => p.status === 'closed');
        if (closedPositions.length === 0) return 0;
        
        const winners = closedPositions.filter(p => p.pnl > 0);
        return winners.length / closedPositions.length;
    }

    public getPosition(tokenAddress: string): Position | undefined {
        return this.state.positions.find(p => p.tokenAddress === tokenAddress);
    }

    public getAllPositions(): Position[] {
        return this.state.positions;
    }

    public getActivePositions(): Position[] {
        return this.state.positions.filter(p => p.status === 'open');
    }

    public getRiskMetrics(): RiskMetrics {
        return this.state.riskMetrics;
    }

    public start(): void {
        logger.info('Trading system started');
        this.tokenMonitor.clearOldData();
    }

    public stop(): void {
        logger.info('Trading system stopped');
    }
}
