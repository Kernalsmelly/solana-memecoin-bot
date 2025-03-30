"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationManager = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class NotificationManager {
    constructor(config) {
        this.discord = config.discord;
        this.telegram = config.telegram;
        this.notifyLevel = config.notifyLevel;
    }
    async notifyPattern(pattern) {
        const message = `🔔 Pattern Detected: ${pattern.pattern}\n` +
            `Token: ${pattern.metrics.symbol} (${pattern.tokenAddress})\n` +
            `Confidence: ${pattern.confidence.toFixed(1)}%\n` +
            `Timestamp: ${new Date(pattern.timestamp).toLocaleString()}`;
        await this.notify(message, 'important');
    }
    async notifyTrade(type, position) {
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
        await this.notify(message, 'critical');
    }
    async notifyInfo(message) {
        const level = 'all'; // Or adjust based on info importance
        await this.notify(message, level);
    }
    async notify(message, level) {
        // Check notification level
        if (level === 'important' && this.notifyLevel === 'critical')
            return;
        if (level === 'all' && this.notifyLevel !== 'all')
            return;
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
            logger_1.default.info(`Notification sent: ${message}`);
        }
        catch (error) {
            logger_1.default.error('Error sending notification:', error);
        }
    }
    async sendDiscordMessage(message) {
        if (!this.discord?.webhookUrl)
            return;
        try {
            const response = await fetch(this.discord.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message })
            });
            if (!response.ok) {
                throw new Error(`Discord webhook error: ${response.statusText}`);
            }
        }
        catch (error) {
            logger_1.default.error('Error sending Discord message:', error);
        }
    }
    async sendTelegramMessage(message) {
        // TODO: Implement Telegram message sending
        logger_1.default.info('Telegram notification not implemented yet');
    }
    async cleanup() {
        // Cleanup any resources (e.g., Telegram client)
        logger_1.default.info('Notification manager cleaned up');
    }
}
exports.NotificationManager = NotificationManager;
