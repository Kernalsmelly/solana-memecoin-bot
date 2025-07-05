import { Position, TradingSignal, RiskMetrics } from '../types';
import { NotificationManager } from './notificationManager';
import logger from '../utils/logger';
import { EventEmitter } from 'events';
import { PublicKey } from '@solana/web3.js'; // Correct PublicKey import
import { tradeLogger } from '../utils/tradeLogger';

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

        console.log('[DEBUG] openPosition received signal:', signal);
// Create new position
        const position: Position = {
            id: `${signal.tokenAddress}-${Date.now()}`, // Add unique ID
            tokenAddress: signal.tokenAddress,
            tokenSymbol: signal.tokenSymbol || 'UNKNOWN',
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

        // Log trade open
        tradeLogger.log({
            timestamp: new Date().toISOString(),
            action: 'buy',
            token: position.tokenSymbol || 'UNKNOWN',
            pairAddress: position.tokenAddress,
            price: position.entryPrice,
            amount: position.size,
            pnl: 0,
            reason: 'entry',
            txid: '',
            success: true
        });
        
        // Notify
        await this.notificationManager.notifyTrade('open', position);
        this.emit('trade', { type: 'open', position });
    }

    private consecutiveLosses: number = 0;
private totalFeesPaid: number = 0;
private totalSlippagePaid: number = 0;
private async closePosition(tokenAddress: string): Promise<void> {
        const position = this.positions.get(tokenAddress);
        if (!position) {
            logger.warn(`No position found for token: ${tokenAddress}`);
            return;
        }

        // Update position status
        position.status = 'closed';
        
        // Calculate raw PnL
        const rawPnl = position.size * (position.currentPrice - position.entryPrice) / position.entryPrice;
        // --- Cost modeling with real fee ---
        const { slippagePercent, feePerTradeSol } = this.config.trading;
        const avgPrice = (position.entryPrice + position.currentPrice) / 2;
        const slippageCost = avgPrice * position.size * (slippagePercent / 100);
        let feeCost = 2 * feePerTradeSol;
        // Try to fetch real on-chain fee for the close leg
        try {
            if (this.connection && typeof this.connection.getFeeForMessage === 'function' && position.closeMessage) {
                const feeResp = await this.connection.getFeeForMessage(position.closeMessage);
                if (feeResp && typeof feeResp.value === 'number') {
                    feeCost = feeResp.value / 1e9; // Convert lamports to SOL
                }
            }
        } catch (err) {
            logger.warn('Failed to fetch real fee, using config default:', err);
        }
        // Net PnL after costs
        const netPnl = rawPnl - slippageCost - feeCost;
        position.pnl = netPnl;
        // Accumulate costs for metrics
        this.totalFeesPaid += feeCost;
        this.totalSlippagePaid += slippageCost;

        // --- Alerting for Consecutive Losses ---
        if (netPnl < 0) {
            this.consecutiveLosses = (this.consecutiveLosses || 0) + 1;
        } else {
            this.consecutiveLosses = 0;
        }
        if (this.consecutiveLosses === 3) {
            await this.notificationManager.notify('🚨 3 Consecutive Losing Trades! Review bot performance and risk settings.', 'errors');
        }

        // --- Alerting for Drawdown Breach ---
        // Drawdown = (highWaterMark - currentBalance) / highWaterMark
        const drawdown = this.highWaterMark > 0 ? (this.highWaterMark - this.currentBalance) / this.highWaterMark : 0;
        const drawdownAlertPct = (this.config.risk?.maxDrawdownPercent ?? 10) / 100; // Configurable threshold
        if (drawdown >= drawdownAlertPct) {
            await this.notificationManager.notify(`🚨 Drawdown Breach: ${(drawdown * 100).toFixed(2)}% from high-water mark!`, 'errors');
        }

        // Update balance and metrics
        this.currentBalance += netPnl;
        this.dailyPnL += netPnl;
        if (netPnl < 0) {
            this.dailyLoss += Math.abs(netPnl);
        }
        if (this.currentBalance > this.highWaterMark) {
            this.highWaterMark = this.currentBalance;
        }

        // Log trade close
        tradeLogger.log({
            timestamp: new Date().toISOString(),
            action: 'sell',
            token: position.tokenSymbol || 'UNKNOWN',
            pairAddress: position.tokenAddress,
            price: position.currentPrice,
            amount: position.size,
            pnl: position.pnl ?? 0,
            reason: 'stop_loss', // You may want to make this dynamic
            txid: '',
            success: true
        });

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
