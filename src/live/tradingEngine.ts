import { Position, TradingSignal, RiskMetrics } from '../types';
import { NotificationManager } from './notificationManager';
import logger from '../utils/logger';
import { EventEmitter } from 'events';
import { PublicKey } from '@solana/web3.js'; // Correct PublicKey import

interface TradingEngineConfig {
    maxPositions: number;
    maxPositionSize: number;
    maxDrawdown: number;
    notificationManager: NotificationManager;
}

export class TradingEngine extends EventEmitter {
    private positions: Map<string, Position>;
    private maxPositions: number;
    private maxPositionSize: number;
    private maxDrawdown: number;
    private notificationManager: NotificationManager;
    private initialBalance: number;
    private currentBalance: number;
    private highWaterMark: number;
    private dailyPnL: number;
    private dailyLoss: number;

    constructor(config: TradingEngineConfig) {
        super();
        this.positions = new Map();
        this.maxPositions = config.maxPositions;
        this.maxPositionSize = config.maxPositionSize;
        this.maxDrawdown = config.maxDrawdown;
        this.notificationManager = config.notificationManager;
        this.initialBalance = 1000; // Default starting balance
        this.currentBalance = this.initialBalance;
        this.highWaterMark = this.initialBalance;
        this.dailyPnL = 0;
        this.dailyLoss = 0;

        logger.info('Trading engine initialized', {
            maxPositions: this.maxPositions,
            maxPositionSize: this.maxPositionSize,
            maxDrawdown: this.maxDrawdown
        });
    }

    public async processSignal(signal: TradingSignal): Promise<void> {
        try {
            if (signal.signalType === 'buy') {
                await this.openPosition(signal);
            } else {
                await this.closePosition(signal.tokenAddress);
            }
        } catch (error) {
            logger.error('Error processing trading signal:', error);
            this.emit('error', error);
        }
    }

    private async openPosition(signal: TradingSignal): Promise<void> {
        // Check if we can open a new position
        if (this.positions.size >= this.maxPositions) {
            logger.warn('Maximum positions reached, cannot open new position');
            return;
        }

        // Check if position size is within limits
        if (signal.positionSize > this.maxPositionSize) {
            signal.positionSize = this.maxPositionSize;
        }

        // Create new position
        const position: Position = {
            id: `${signal.tokenAddress}-${Date.now()}`, // Add unique ID
            tokenAddress: signal.tokenAddress,
            tokenSymbol: 'UNKNOWN', // TEMP FIX: Symbol not in signal
            tokenMint: new PublicKey(signal.tokenAddress), // TEMP FIX: Placeholder, assuming address is mint
            tokenDecimals: 9, // TEMP FIX: Placeholder, common Solana decimals
            quantity: signal.positionSize / signal.price, // TEMP FIX: Placeholder calculation
            entryPrice: signal.price,
            currentPrice: signal.price,
            size: signal.positionSize,
            stopLoss: signal.stopLoss,
            takeProfit: 0, // TEMP FIX: Placeholder
            status: 'open',
            pnl: 0,
            timestamp: Date.now()
        };

        // Save position
        this.positions.set(signal.tokenAddress, position);
        
        // Notify
        await this.notificationManager.notifyTrade('open', position);
        this.emit('trade', { type: 'open', position });
    }

    private async closePosition(tokenAddress: string): Promise<void> {
        const position = this.positions.get(tokenAddress);
        if (!position) {
            logger.warn(`No position found for token: ${tokenAddress}`);
            return;
        }

        // Update position status
        position.status = 'closed';
        
        // Calculate PnL
        const pnl = position.size * (position.currentPrice - position.entryPrice) / position.entryPrice;
        position.pnl = pnl;

        // Update balance and metrics
        this.currentBalance += pnl;
        this.dailyPnL += pnl;
        if (pnl < 0) {
            this.dailyLoss += Math.abs(pnl);
        }
        if (this.currentBalance > this.highWaterMark) {
            this.highWaterMark = this.currentBalance;
        }

        // Remove position
        this.positions.delete(tokenAddress);

        // Notify
        await this.notificationManager.notifyTrade('close', position);
        this.emit('trade', { type: 'close', position });
    }

    public getRiskMetrics(): RiskMetrics {
        const drawdown = ((this.highWaterMark - this.currentBalance) / this.highWaterMark) * 100;
        const totalTrades = this.positions.size;
        const profitableTrades = Array.from(this.positions.values()).filter(p => typeof p.pnl === 'number' && p.pnl > 0).length;
        const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

        return {
            currentBalance: this.currentBalance,
            dailyPnL: this.dailyPnL,
            drawdown,
            winRate,
            activePositions: this.positions.size,
            availablePositions: this.maxPositions - this.positions.size,
            highWaterMark: this.highWaterMark,
            dailyLoss: this.dailyLoss
        };
    }

    public getPositions(): Position[] {
        return Array.from(this.positions.values());
    }

    public getPosition(tokenAddress: string): Position | undefined {
        return this.positions.get(tokenAddress);
    }

    public async updatePrice(tokenAddress: string, price: number): Promise<void> {
        const position = this.positions.get(tokenAddress);
        if (position) {
            position.currentPrice = price;

            // Check stop loss
            if (price <= position.stopLoss) {
                await this.closePosition(tokenAddress);
                logger.info(`Stop loss triggered for ${position.tokenSymbol}`);
            }
        }
    }

    public resetDailyMetrics(): void {
        this.dailyPnL = 0;
        this.dailyLoss = 0;
    }
}
