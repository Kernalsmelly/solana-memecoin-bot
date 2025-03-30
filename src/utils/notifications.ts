import * as dotenv from 'dotenv';
import axios from 'axios';
import logger from './logger';

dotenv.config();

export type AlertLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface AlertOptions {
  useDiscord?: boolean;
  useTelegram?: boolean;
  includeTimestamp?: boolean;
}

const DEFAULT_OPTIONS: AlertOptions = {
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
export async function sendAlert(
  message: string, 
  level: AlertLevel = 'INFO',
  options: AlertOptions = DEFAULT_OPTIONS
): Promise<boolean> {
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
        await axios.post(process.env.DISCORD_WEBHOOK_URL, {
          content: discordMessage,
          username: 'SolMemeBot Alert',
          embeds: [{
            title: `${level} Alert`,
            description: message,
            color: getAlertColor(level),
            timestamp: new Date().toISOString()
          }]
        });
        
        logger.debug('Discord notification sent', { level, message });
      } catch (error) {
        logger.error('Failed to send Discord notification', error);
        success = false;
      }
    }
    
    // Send to Telegram if configured
    if (useTelegram && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      try {
        const telegramMessage = `${emoji} *${level}*\n${message}`;
        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: telegramMessage,
            parse_mode: 'Markdown'
          }
        );
        
        logger.debug('Telegram notification sent', { level, message });
      } catch (error) {
        logger.error('Failed to send Telegram notification', error);
        success = false;
      }
    }
    
    return success;
  } catch (error) {
    logger.error('Failed to send notifications', error);
    return false;
  }
}

/**
 * Get emoji for alert level
 */
function getAlertEmoji(level: AlertLevel): string {
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
function getAlertColor(level: AlertLevel): number {
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
  const level = (args[0]?.toUpperCase() as AlertLevel) || 'INFO';
  const message = args[1] || 'Test notification';
  
  (async () => {
    console.log(`Sending test ${level} notification: ${message}`);
    const success = await sendAlert(message, level);
    
    if (success) {
      console.log('Notification sent successfully');
    } else {
      console.error('Failed to send notification');
      process.exit(1);
    }
    
    process.exit(0);
  })();
}

export default sendAlert;
