import * as dotenv from 'dotenv';
import logger from './logger.js';
dotenv.config();
const DEFAULT_OPTIONS = {
    // useDiscord: true,
    // useTelegram: true,
    includeTimestamp: true,
};
/**
 * Send an alert through configured notification channels
 * @param message Alert message
 * @param level Alert level (INFO, WARNING, ERROR, CRITICAL)
 * @param options Notification options
 */
export async function sendPatternMatchAlert(event) {
    const msg = `🚦 PatternMatchEvent: *${event.strategy || 'unknown'}*\nToken: \`${event.address}\`\nSuggested SOL: ${event.suggestedSOL}\nDetails: ${JSON.stringify(event.details)}`;
    return sendAlert(msg, 'INFO');
}
export async function sendExitFilledAlert(event) {
    const msg = `🏁 ExitFilledEvent: *${event.exitType}*\nToken: \`${event.address}\`\nEntry: ${event.entryPrice}\nExit: ${event.exitPrice}\nTime: ${new Date(event.timestamp).toLocaleString()}`;
    return sendAlert(msg, 'INFO');
}
export async function sendExitTimeoutAlert(event) {
    const msg = `⏰ ExitTimeoutEvent
Token: ${event.address}
Reason: ${event.reason}
Entry: ${event.entryPrice}
Time: ${new Date(event.timestamp).toLocaleString()}`;
    return sendAlert(msg, 'WARNING');
}
export async function sendAlert(message, level = 'INFO', options = DEFAULT_OPTIONS) {
    const { useDiscord, useTelegram, includeTimestamp } = { ...DEFAULT_OPTIONS, ...options };
    const success = true;
    // Format message with timestamp if needed
    const formattedMessage = includeTimestamp
        ? `[${new Date().toISOString()}] ${level}: ${message}`
        : `${level}: ${message}`;
    // Get emoji based on level
    const emoji = getAlertEmoji(level);
    const discordMessage = `${emoji} ${formattedMessage}`;
    try {
        // Discord and Telegram notifications fully disabled
        return success;
    }
    catch (error) {
        logger.error('Failed to send notifications', error);
        return false;
    }
}
/**
 * Get emoji for alert level
 */
function getAlertEmoji(level) {
    switch (level) {
        case 'INFO':
            return 'ℹ️';
        case 'WARNING':
            return '⚠️';
        case 'ERROR':
            return '❌';
        case 'CRITICAL':
            return '🚨';
        default:
            return '📢';
    }
}
/**
 * Get Discord color code for alert level
 */
function getAlertColor(level) {
    switch (level) {
        case 'INFO':
            return 0x3498db; // Blue
        case 'WARNING':
            return 0xf1c40f; // Yellow
        case 'ERROR':
            return 0xe74c3c; // Red
        case 'CRITICAL':
            return 0x9b59b6; // Purple
        default:
            return 0x95a5a6; // Gray
    }
}
export default sendAlert;
//# sourceMappingURL=notifications.js.map