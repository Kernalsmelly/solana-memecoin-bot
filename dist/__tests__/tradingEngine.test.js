import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/utils/logger', () => import('../src/tests/mocks/mockLogger'));
import { TradingEngine } from '../src/live/tradingEngine';
describe('TradingEngine PnL computation', () => {
    it('computes PnL with entry, exit, slippage, and fee', async () => {
        // Mock config
        const config = {
            trading: {
                slippagePercent: 0.2, // 0.2% slippage
                feePerTradeSol: 0.000005, // 0.000005 SOL per trade
            },
        };
        // Mock NotificationManager
        const notificationManager = {
            notifyTrade: vi.fn(),
            notify: vi.fn(),
        };
        // Mock Connection
        const connection = {
            getFeeForMessage: vi.fn().mockResolvedValue({ value: 8000 }), // 8,000 lamports = 0.000008 SOL
        };
        // Create engine
        const engine = new TradingEngine({
            maxPositions: 3,
            maxPositionSize: 100,
            maxDrawdown: 0.2,
            notificationManager,
        });
        engine.config = config;
        engine.connection = connection;
        // Simulate open position
        const token = 'TESTTOKEN';
        const position = {
            entryPrice: 100,
            currentPrice: 110,
            size: 1,
            status: 'open',
            closeMessage: {}, // triggers fee fetch
        };
        engine.positions.set(token, position);
        // Close position
        await engine.closePosition(token);
        // Manual PnL calculation:
        // Raw PnL: (110-100)/100*1 = 0.1
        // Slippage: avg(100,110)*1*0.002 = 105*0.002 = 0.21
        // Fee: fetched = 0.000008 SOL
        // Net PnL: 0.1 - 0.21 - 0.000008 = -0.110008
        expect(position.pnl).toBeCloseTo(-0.110008, 6);
    });
});
//# sourceMappingURL=tradingEngine.test.js.map