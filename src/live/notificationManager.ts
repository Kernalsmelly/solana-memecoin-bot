import { PatternDetection, Position, RiskMetrics } from '../types';
import logger from '../utils/logger';

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
    notifyLevel: 'all' | 'important' | 'critical';
}

export class NotificationManager {
    private discord?: DiscordConfig;
    private telegram?: TelegramConfig;
    private notifyLevel: string;

    constructor(config: NotificationConfig) {
        this.discord = config.discord;
        this.telegram = config.telegram;
        this.notifyLevel = config.notifyLevel;
    }

    public async notifyPattern(pattern: PatternDetection): Promise<void> {
        const message = `🔔 Pattern Detected: ${pattern.pattern}\n` +
            `Token: ${pattern.metrics.symbol} (${pattern.tokenAddress})\n` +
            `Confidence: ${pattern.confidence.toFixed(1)}%\n` +
            `Timestamp: ${new Date(pattern.timestamp).toLocaleString()}`;

        await this.notify(message, 'important');
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

        await this.notify(message, 'important');
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
        await this.notify(message, 'critical');
    }

    public async notifyInfo(message: string): Promise<void> {
        const level = 'all'; // Or adjust based on info importance
        await this.notify(message, level);
    }

    private async notify(message: string, level: 'all' | 'important' | 'critical'): Promise<void> {
        // Check notification level
        if (level === 'important' && this.notifyLevel === 'critical') return;
        if (level === 'all' && this.notifyLevel !== 'all') return;

        try {
            // Send to Discord
            if (this.discord) {
                await this.sendDiscordMessage(message);
            }

            // Send to Telegram
            if (this.telegram) {
                await this.sendTelegramMessage(message);
            }

            // Log message
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
        // TODO: Implement Telegram message sending
        logger.info('Telegram notification not implemented yet');
    }

    public async cleanup(): Promise<void> {
        // Cleanup any resources (e.g., Telegram client)
        logger.info('Notification manager cleaned up');
    }
}
