const sendAlertSpy = vi.fn((...args) => {
    console.log('[TEST DEBUG] sendAlert called with:', ...args);
    return Promise.resolve(true);
});
vi.mock('../src/utils/notifications.js', () => ({
    __esModule: true,
    sendAlert: sendAlertSpy,
    default: sendAlertSpy,
}));
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/utils/logger', () => import('../src/tests/mocks/mockLogger'));
import { PublicKey } from '@solana/web3.js';
describe('TradingEngine alerting', () => {
    it('fires consecutive-loss and drawdown alerts', async () => {
        await vi.resetModules();
        const { TradingEngine } = await import('../src/services/tradingEngine');
        const NotificationManager = await import('../src/utils/notifications.js');
        // Mock config with 10% drawdown threshold
        const config = {
            trading: {
                slippagePercent: 0.2,
                feePerTradeSol: 0.000005,
            },
            risk: {
                maxDrawdownPercent: 10,
            },
        };
        // Mock NotificationManager
        // Create engine WITHOUT notificationManager mock so real alerts are triggered
        const engine = new TradingEngine({
            maxPositions: 3,
            maxPositionSize: 100,
            maxDrawdown: 0.2,
        });
        engine.config = config;
        engine.currentBalance = 1000;
        engine.highWaterMark = 1000;
        // Mock Solana connection
        const mockConnection = {
            getFeeForMessage: async () => ({ value: 0 }),
        };
        engine.connection = mockConnection;
        // Mock feedbackLoop to prevent undefined error
        engine.feedbackLoop = { addTrade: vi.fn() };
        // Mock tradeManager to prevent undefined error
        engine.tradeManager = { addTrade: vi.fn() };
        // Mock wallet and riskManager
        engine.wallet = { publicKey: { toString: () => 'walletpubkey' } };
        engine.riskManager = { getDynamicPositionSizeSol: () => 1 };
        // Simulate 3 consecutive losses
        const tokens = [
            new PublicKey('So11111111111111111111111111111111111111112'),
            new PublicKey('So11111111111111111111111111111111111111113'),
            new PublicKey('So11111111111111111111111111111111111111114'),
        ];
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const symbol = `LOSS${i}`;
            // Add a position with negative PnL
            const position = {
                entryPrice: 100,
                currentPrice: 90,
                entryTimestamp: Date.now() - 1000,
                amountBoughtUi: 1,
                size: 1,
                status: 'open',
                mint: token,
                symbol,
                pairAddress: 'So11111111111111111111111111111111111111112',
            };
            engine.positions.set(token, position);
            // Simulate sell with negative PnL
            // eslint-disable-next-line no-console
            console.log('[TEST DEBUG] About to sellToken with mint:', token.toBase58(), typeof token);
            await engine.sellToken(token, '', {
                symbol,
                currentPrice: 90,
                amount: 1,
                rawPnL: -10,
                liquidity: 1000,
                volume1h: 10000,
                buyRatio5m: 0.5,
                pairAddress: 'So11111111111111111111111111111111111111112',
                transaction: { message: { serialize: () => Buffer.from([]) } },
            });
        }
        // Directly trigger loss alert logic as in lossAlert test
        engine.consecutiveLosses = 3;
        const drawdown = 0;
        const threshold = 10;
        await engine.checkLossAlert(drawdown, threshold);
        // Debug: print function references
        // eslint-disable-next-line no-console
        console.log('[TEST DEBUG] NotificationManager.sendAlert:', NotificationManager.sendAlert);
        // eslint-disable-next-line no-console
        console.log('[TEST DEBUG] typeof NotificationManager.sendAlert:', typeof NotificationManager.sendAlert);
        // eslint-disable-next-line no-console
        console.log('[TEST DEBUG] NotificationManager.sendAlert.toString():', NotificationManager.sendAlert.toString());
        // Print the full notifications module object
        // eslint-disable-next-line no-console
        console.log('[TEST DEBUG] NotificationManager module object:', NotificationManager);
        // Check consecutive-loss alert fired
        expect(NotificationManager.sendAlert).toHaveBeenCalledWith(expect.stringContaining('consecutive losses'), 'CRITICAL');
        // Prepare for drawdown alert: clear previous spy calls
        NotificationManager.sendAlert.mockClear();
        // Set up for drawdown alert: consecutiveLosses reset
        engine.consecutiveLosses = 0;
        // Call with drawdown <= -threshold to trigger alert
        await engine.checkLossAlert(-15, 10);
        expect(NotificationManager.sendAlert).toHaveBeenCalledWith('Drawdown Breach', 'CRITICAL');
    });
});
//# sourceMappingURL=tradingEngine.alerts.test.js.map