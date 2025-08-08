import { describe, it, expect } from 'vitest';
import { ExitManager } from '../strategies/exitManager';
describe('ExitManager', () => {
    it('triggers stop-loss and take-profit exits', async () => {
        const exitManager = new ExitManager({ stopLossPct: 10, takeProfitPct: 20, timeoutMs: 10000 });
        const address = '0xEXIT';
        const entryPrice = 100;
        const now = Date.now();
        let exitType = '';
        exitManager.scheduleExit(address, entryPrice, now);
        exitManager.on('exitFilled', (e) => {
            exitType = e.exitType;
        });
        // Should trigger stop-loss
        exitManager.onPriceUpdate({ address, price: 90, timestamp: now + 1000 });
        expect(exitType).toBe('stopLoss');
        // Reset
        exitType = '';
        exitManager.scheduleExit(address, entryPrice, now);
        // Should trigger take-profit
        exitManager.onPriceUpdate({ address, price: 120, timestamp: now + 2000 });
        expect(exitType).toBe('takeProfit');
    });
    it('triggers timeout if no exit hit', async () => {
        const exitManager = new ExitManager({ stopLossPct: 10, takeProfitPct: 20, timeoutMs: 100 });
        const address = '0xTIMEOUT';
        const entryPrice = 100;
        const now = Date.now();
        let timeout = false;
        exitManager.scheduleExit(address, entryPrice, now);
        exitManager.on('exitTimeout', () => {
            timeout = true;
        });
        // Wait for timeout
        await new Promise((r) => setTimeout(r, 200));
        expect(timeout).toBe(true);
    });
});
//# sourceMappingURL=exitManager.test.js.map