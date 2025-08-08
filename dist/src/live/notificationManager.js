import logger from '../utils/logger.js';
import { persistTrade } from '../utils/persistence.js';
export class NotificationManager {
    discord;
    telegram;
    notifyLevel;
    constructor(config) {
        this.discord = config.discord;
        this.telegram = config.telegram;
        this.notifyLevel = config.notifyLevel ?? 'all';
    }
    async notifyPattern(pattern) {
        const message = `🔔 Pattern Detected: ${pattern.pattern}\n` +
            `Token: ${pattern.metrics.symbol} (${pattern.tokenAddress})\n` +
            `Confidence: ${pattern.confidence.toFixed(1)}%\n` +
            `Timestamp: ${new Date(pattern.timestamp).toLocaleString()}`;
        await this.notify(message, 'patterns');
    }
    async notifyTrade(trade) {
        // PILOT PATCH: Handle undefined or malformed trade objects gracefully
        if (!trade || typeof trade !== 'object') {
            this.notifyError('Trade notification failed: trade object is undefined or malformed.');
            return;
        }
        // Fallbacks for missing properties
        const token = trade.token || trade.tokenSymbol || 'UNKNOWN';
        const price = trade.price || 0;
        const action = trade.action || 'buy';
        const dryRun = trade.dryRun ?? true;
        const success = trade.success ?? false;
        const size = trade.size !== undefined ? `$${trade.size}` : '';
        const pnl = trade.pnl !== undefined ? `PnL: ${trade.pnl > 0 ? '+' : ''}${trade.pnl}%\n` : '';
        const stopLoss = trade.stopLoss !== undefined ? `Stop Loss: $${trade.stopLoss}` : '';
        const message = trade.message ||
            `[Trade] ${action.toUpperCase()} ${token} at ${price}\n${size}\n${pnl}${stopLoss}`;
        await this.notify(message, 'trades');
        // Persist trade event for analytics
        await persistTrade({ ...trade, timestamp: new Date().getTime() });
    }
    async notifyRisk(metrics) {
        const message = `📊 Risk Metrics Update\n` +
            `Balance: $${metrics.currentBalance.toFixed(2)}\n` +
            `Daily P&L: ${metrics.dailyPnL > 0 ? '+' : ''}$${metrics.dailyPnL.toFixed(2)}\n` +
            `Drawdown: ${metrics.drawdown.toFixed(1)}%\n` +
            `Win Rate: ${metrics.winRate.toFixed(1)}%\n` +
            `Positions: ${metrics.activePositions}/${metrics.activePositions + metrics.availablePositions}`;
        await this.notify(message, 'all');
    }
    async notifyError(error) {
        const message = `⚠️ Error: ${error instanceof Error ? error.message : error}`;
        await this.notify(message, 'errors');
    }
    async notifyInfo(message) {
        const level = 'all';
        await this.notify(message, level);
    }
    async notify(message, level) {
        const shouldNotify = this.notifyLevel === 'all' ||
            (this.notifyLevel === 'patterns' && (level === 'patterns' || level === 'errors')) ||
            (this.notifyLevel === 'trades' && (level === 'trades' || level === 'errors')) ||
            (this.notifyLevel === 'errors' && level === 'errors');
        if (!shouldNotify || this.notifyLevel === 'none') {
            return;
        }
        try {
            if (this.discord) {
                await this.sendDiscordMessage(message);
            }
            // if (this.telegram) {
            //     await this.sendTelegramMessage(message);
            // }
            logger.info(`Notification sent: ${message}`);
        }
        catch (error) {
            logger.error('Error sending notification:', error);
        }
    }
    async sendDiscordMessage(message) {
        if (!this.discord?.webhookUrl)
            return;
        try {
            const response = await fetch(this.discord.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message }),
            });
            if (!response.ok) {
                throw new Error(`Discord webhook error: ${response.statusText}`);
            }
        }
        catch (error) {
            logger.error('Error sending Discord message:', error);
        }
    }
    async sendTelegramMessage(message) {
        logger.info('Telegram notification not implemented yet');
    }
    async cleanup() {
        logger.info('Notification manager cleaned up');
    }
}
//# sourceMappingURL=notificationManager.js.map