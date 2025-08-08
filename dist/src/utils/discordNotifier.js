import axios from 'axios';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
export async function sendDiscordSignal(payload, webhookUrlOverride) {
    const webhookUrl = webhookUrlOverride || DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error('Discord webhook URL not set in config, environment, or override.');
    }
    const embed = {
        title: payload.type === 'BUY_SIGNAL'
            ? '🚨 Buy Signal Detected!'
            : payload.type === 'SELL_SIGNAL'
                ? 'Sell Signal'
                : 'Alert',
        description: `**Token:** ${payload.token.symbol || ''} (${payload.token.mint})\n**Pool:** ${payload.token.poolAddress || 'N/A'}\n**Price:** $${payload.price}\n**Liquidity:** $${payload.liquidity}\n**Volume (1h):** $${payload.volume}\n**Buy Ratio:** ${payload.buyRatio}\n**Reason:** ${payload.reason}`,
        color: payload.type === 'BUY_SIGNAL'
            ? 0x00ff00
            : payload.type === 'SELL_SIGNAL'
                ? 0xff0000
                : 0xffff00,
        timestamp: new Date(payload.timestamp || Date.now()).toISOString(),
        fields: [
            ...(payload.links?.solscan
                ? [{ name: 'Solscan', value: `[View Token](${payload.links.solscan})`, inline: true }]
                : []),
            ...(payload.links?.raydium
                ? [{ name: 'Raydium', value: `[Trade on Raydium](${payload.links.raydium})`, inline: true }]
                : []),
        ],
    };
    try {
        await axios.post(webhookUrl, {
            embeds: [embed],
        });
        console.log('Discord signal sent successfully.');
    }
    catch (error) {
        console.error('Failed to send Discord signal:', error?.response?.data || error.message || error);
        throw error;
    }
}
//# sourceMappingURL=discordNotifier.js.map