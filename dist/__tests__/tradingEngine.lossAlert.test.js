import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/utils/logger', () => import('../src/tests/mocks/mockLogger'));
describe('TradingEngine consecutive-loss alert', () => {
    it('fires only after >=3 consecutive losses', async () => {
        // Create a mock for sendAlert
        const sendAlert = vi.fn().mockResolvedValue(true);
        sendAlert.__isMock = true;
        const { TradingEngine } = await import('../src/services/tradingEngine');
        expect(typeof sendAlert).toBe('function');
        const engine = new TradingEngine({}, {}, {}, undefined, sendAlert);
        engine['consecutiveLosses'] = 3;
        const drawdown = 0;
        const threshold = 10;
        await engine.checkLossAlert(drawdown, threshold);
        expect(sendAlert).toHaveBeenCalledTimes(1);
        expect(sendAlert.mock.calls[0][0]).toMatch(/3 consecutive losses/);
    });
});
//# sourceMappingURL=tradingEngine.lossAlert.test.js.map