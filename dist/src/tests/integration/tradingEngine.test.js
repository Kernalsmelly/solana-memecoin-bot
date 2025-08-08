import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../src/utils/logger', () => import('../../mocks/mockLogger'));
import { TradingEngine } from '../../services/tradingEngine';
// This test spins up TradingEngine in dry-run mode and runs a single trade to ensure no errors are thrown and the trade is logged
describe('TradingEngine Integration Smoke Test', () => {
    it('should initialize, run a dry-run trade, and not throw', async () => {
        const notificationManager = {
            notifyTrade: () => { },
            notify: () => { },
        };
        const config = {
            trading: {
                slippagePercent: 0.2,
                feePerTradeSol: 0.000005,
            },
            risk: {
                maxDrawdownPercent: 10,
            },
        };
        // Use a minimal TradingEngine config for dry-run
        const engine = new TradingEngine({
            maxPositions: 1,
            maxPositionSize: 100,
            maxDrawdown: 0.2,
            notificationManager,
            dryRun: true,
        });
        engine.config = config;
        // Simulate a token and marketData for a dry-run buy
        const marketData = {
            mint: 'So11111111111111111111111111111111111111112',
            price: 0.01,
            volume: 1000000,
            timestamp: Date.now(),
            symbol: 'MEME',
        };
        // Should not throw and should log a trade
        let threw = false;
        try {
            await engine.buyToken(new (await import('@solana/web3.js')).PublicKey(marketData.mint), undefined, marketData);
        }
        catch (e) {
            threw = true;
            console.error('Dry-run trade threw:', e);
        }
        expect(threw).toBe(false);
        // Optionally, check that a trade was actually attempted/logged
        // (engine.tradeLogger or notificationManager.notifyTrade could be spied in a more advanced version)
    });
});
//# sourceMappingURL=tradingEngine.test.js.map