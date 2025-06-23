import { PatternDetection, Position, RiskMetrics } from '../types';
import logger from '../utils/logger';
import { persistTrade } from '../utils/persistence';

interface DiscordConfig {
    webhookUrl: string;
}

interface TelegramConfig {
    apiId: number;
    apiHash: string;
    sessionString: string;
    chatId: string;
}

interface NotificationConfig {
    discord?: DiscordConfig;
    telegram?: TelegramConfig;
    notifyLevel?: 'all' | 'trades' | 'errors' | 'patterns' | 'none';
}

export class NotificationManager {
    private discord?: DiscordConfig;
    private telegram?: TelegramConfig;
    private notifyLevel: 'all' | 'trades' | 'errors' | 'patterns' | 'none';

    constructor(config: NotificationConfig) {
        this.discord = config.discord;
        this.telegram = config.telegram;
        this.notifyLevel = config.notifyLevel ?? 'all';
    }

    public async notifyPattern(pattern: PatternDetection): Promise<void> {
        const message = `🔔 Pattern Detected: ${pattern.pattern}\n` +
            `Token: ${pattern.metrics.symbol} (${pattern.tokenAddress})\n` +
            `Confidence: ${pattern.confidence.toFixed(1)}%\n` +
            `Timestamp: ${new Date(pattern.timestamp).toLocaleString()}`;

        await this.notify(message, 'patterns');
    }

    public async notifyTrade(type: 'open' | 'close', position: Position): Promise<void> {
        const emoji = type === 'open' ? '🟢' : '🔴';
        const action = type === 'open' ? 'Opened' : 'Closed';
        
        const message = `${emoji} ${action} Position\n` +
            `Token: ${position.tokenSymbol}\n` +
            `Price: $${position.currentPrice.toFixed(8)}\n` +
            `Size: $${position.size.toFixed(2)}\n` +
            (position.pnl ? `PnL: ${position.pnl > 0 ? '+' : ''}${position.pnl.toFixed(2)}%\n` : '') +
            `Stop Loss: $${position.stopLoss.toFixed(8)}`;

        await this.notify(message, 'trades');
        // Persist trade event for analytics
        await persistTrade({ type, ...position, timestamp: new Date().getTime() });
    }

    public async notifyRisk(metrics: RiskMetrics): Promise<void> {
        const message = `📊 Risk Metrics Update\n` +
            `Balance: $${metrics.currentBalance.toFixed(2)}\n` +
            `Daily P&L: ${metrics.dailyPnL > 0 ? '+' : ''}$${metrics.dailyPnL.toFixed(2)}\n` +
            `Drawdown: ${metrics.drawdown.toFixed(1)}%\n` +
            `Win Rate: ${metrics.winRate.toFixed(1)}%\n` +
            `Positions: ${metrics.activePositions}/${metrics.activePositions + metrics.availablePositions}`;

        await this.notify(message, 'all');
    }

    public async notifyError(error: string | Error): Promise<void> {
        const message = `⚠️ Error: ${error instanceof Error ? error.message : error}`;
        await this.notify(message, 'errors');
    }

    public async notifyInfo(message: string): Promise<void> {
        const level = 'all';
        await this.notify(message, level);
    }

    public async notify(message: string, level: 'all' | 'trades' | 'errors' | 'patterns'): Promise<void> {
        const shouldNotify = (
            this.notifyLevel === 'all' ||
            (this.notifyLevel === 'patterns' && (level === 'patterns' || level === 'errors')) ||
            (this.notifyLevel === 'trades' && (level === 'trades' || level === 'errors')) ||
            (this.notifyLevel === 'errors' && level === 'errors')
        );

        if (!shouldNotify || this.notifyLevel === 'none') {
            return;
        }

        try {
            if (this.discord) {
                await this.sendDiscordMessage(message);
            }

            if (this.telegram) {
                await this.sendTelegramMessage(message);
            }

            logger.info(`Notification sent: ${message}`);
        } catch (error) {
            logger.error('Error sending notification:', error);
        }
    }

    private async sendDiscordMessage(message: string): Promise<void> {
        if (!this.discord?.webhookUrl) return;

        try {
            const response = await fetch(this.discord.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message })
            });

            if (!response.ok) {
                throw new Error(`Discord webhook error: ${response.statusText}`);
            }
        } catch (error) {
            logger.error('Error sending Discord message:', error);
        }
    }

    private async sendTelegramMessage(message: string): Promise<void> {
        logger.info('Telegram notification not implemented yet');
    }

    public async cleanup(): Promise<void> {
        logger.info('Notification manager cleaned up');
    }
}
