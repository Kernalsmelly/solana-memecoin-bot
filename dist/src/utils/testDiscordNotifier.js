import { sendDiscordSignal } from './discordNotifier.js';
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1374129323434573874/LpoW5FMchl80UHaGBweKHoGoaLslh6JzeW0hti8XTyDlZyoOInxxxsVynmeFwK2qCYRo';
(async () => {
    await sendDiscordSignal({
        type: 'BUY_SIGNAL',
        token: {
            mint: 'So11111111111111111111111111111111111111112',
            symbol: 'SOL',
            poolAddress: '8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x',
        },
        price: 123.45,
        liquidity: 100000,
        volume: 25000,
        buyRatio: 1.42,
        reason: 'Test notification: Criteria met for demo!',
        links: {
            solscan: 'https://solscan.io/token/So11111111111111111111111111111111111111112',
            raydium: 'https://raydium.io/swap/?inputCurrency=SOL&outputCurrency=So11111111111111111111111111111111111111112',
        },
        timestamp: Date.now(),
    }, WEBHOOK_URL);
    console.log('Test Discord signal sent!');
})();
//# sourceMappingURL=testDiscordNotifier.js.map