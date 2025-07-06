"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPatternMatchAlert = sendPatternMatchAlert;
exports.sendExitFilledAlert = sendExitFilledAlert;
exports.sendExitTimeoutAlert = sendExitTimeoutAlert;
exports.sendAlert = sendAlert;
const dotenv = __importStar(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./logger"));
dotenv.config();
const DEFAULT_OPTIONS = {
    useDiscord: true,
    useTelegram: true,
    includeTimestamp: true
};
/**
 * Send an alert through configured notification channels
 * @param message Alert message
 * @param level Alert level (INFO, WARNING, ERROR, CRITICAL)
 * @param options Notification options
 */
async function sendPatternMatchAlert(event) {
    const msg = `🚦 PatternMatchEvent: *${event.strategy || 'unknown'}*\nToken: \`${event.address}\`\nSuggested SOL: ${event.suggestedSOL}\nDetails: ${JSON.stringify(event.details)}`;
    return sendAlert(msg, 'INFO');
}
async function sendExitFilledAlert(event) {
    const msg = `🏁 ExitFilledEvent: *${event.exitType}*\nToken: \`${event.address}\`\nEntry: ${event.entryPrice}\nExit: ${event.exitPrice}\nTime: ${new Date(event.timestamp).toLocaleString()}`;
    return sendAlert(msg, 'INFO');
}
async function sendExitTimeoutAlert(event) {
    const msg = `⏰ ExitTimeoutEvent
Token: ${event.address}
Reason: ${event.reason}
Entry: ${event.entryPrice}
Time: ${new Date(event.timestamp).toLocaleString()}`;
    return sendAlert(msg, 'WARNING');
}
async function sendAlert(message, level = 'INFO', options = DEFAULT_OPTIONS) {
    const { useDiscord, useTelegram, includeTimestamp } = { ...DEFAULT_OPTIONS, ...options };
    let success = true;
    // Format message with timestamp if needed
    const formattedMessage = includeTimestamp
        ? `[${new Date().toISOString()}] ${level}: ${message}`
        : `${level}: ${message}`;
    // Get emoji based on level
    const emoji = getAlertEmoji(level);
    const discordMessage = `${emoji} ${formattedMessage}`;
    try {
        // Send to Discord if configured
        if (useDiscord && process.env.DISCORD_WEBHOOK_URL) {
            try {
                await axios_1.default.post(process.env.DISCORD_WEBHOOK_URL, {
                    content: discordMessage,
                    username: 'SolMemeBot Alert',
                    embeds: [{
                            title: `${level} Alert`,
                            description: message,
                            color: getAlertColor(level),
                            timestamp: new Date().toISOString()
                        }]
                });
                logger_1.default.debug('Discord notification sent', { level, message });
            }
            catch (error) {
                logger_1.default.error('Failed to send Discord notification', error);
                success = false;
            }
        }
        // Send to Telegram if configured
        if (useTelegram && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
            try {
                const telegramMessage = `${emoji} *${level}*\n${message}`;
                await axios_1.default.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: process.env.TELEGRAM_CHAT_ID,
                    text: telegramMessage,
                    parse_mode: 'Markdown'
                });
                logger_1.default.debug('Telegram notification sent', { level, message });
            }
            catch (error) {
                logger_1.default.error('Failed to send Telegram notification', error);
                success = false;
            }
        }
        return success;
    }
    catch (error) {
        logger_1.default.error('Failed to send notifications', error);
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
// Test notification when run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const level = args[0]?.toUpperCase() || 'INFO';
    const message = args[1] || 'Test notification';
    (async () => {
        console.log(`Sending test ${level} notification: ${message}`);
        const success = await sendAlert(message, level);
        if (success) {
            console.log('Notification sent successfully');
        }
        else {
            console.error('Failed to send notification');
            process.exit(1);
        }
        process.exit(0);
    })();
}
exports.default = sendAlert;
//# sourceMappingURL=notifications.js.map