import { describe, it, expect, vi } from 'vitest';
import { TradingEngine } from '../src/services/tradingEngine';
import { sendAlert } from '../src/utils/notifications';

vi.mock('../src/utils/notifications', () => ({
  sendAlert: vi.fn().mockResolvedValue(true)
}));

describe('TradingEngine alerting', () => {
  it('fires consecutive-loss and drawdown alerts', async () => {
    // Mock config with 10% drawdown threshold
    const config: any = {
      trading: {
        slippagePercent: 0.2,
        feePerTradeSol: 0.000005,
      },
      risk: {
        maxDrawdownPercent: 10
      }
    };
    // Mock NotificationManager
    const notificationManager = {
      notifyTrade: vi.fn(),
      notify: vi.fn()
    } as unknown as NotificationManager;
    // Create engine
    const engine = new TradingEngine({
      maxPositions: 3,
      maxPositionSize: 100,
      maxDrawdown: 0.2,
      notificationManager
    });
    (engine as any).config = config;
    (engine as any).currentBalance = 1000;
    (engine as any).highWaterMark = 1000;
    // Simulate 3 consecutive losses
    for (let i = 0; i < 3; i++) {
      const token = 'LOSS' + i;
      const position: any = {
        entryPrice: 100,
        currentPrice: 90,
        size: 1,
        status: 'open',
      };
      (engine as any).positions.set(token, position);
      // Simulate sell with negative PnL
      await (engine as any).sellToken({
        mint: token,
        currentPrice: 90,
        amount: 1,
        pairAddress: '',
        symbol: token
      });
    }
    // Check consecutive-loss alert fired
    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining('consecutive losses'),
      'CRITICAL'
    );

    // Simulate drawdown breach
    (engine as any).runningPnL = 0;
    (engine as any).peakPnL = 10;
    (engine as any).consecutiveLosses = 0;
    // This sell triggers drawdown alert
    await (engine as any).sellToken({
      mint: 'DRAWDOWN',
      currentPrice: 80,
      amount: 1,
      pairAddress: '',
      symbol: 'DRAWDOWN'
    });
    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining('drawdown'),
      'CRITICAL'
    );
    // Check drawdown alert fired
    expect(notificationManager.notify).toHaveBeenCalledWith(
      expect.stringContaining('Drawdown Breach'),
      'errors'
    );
  });
});
