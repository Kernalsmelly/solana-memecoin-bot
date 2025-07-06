import { TradingEngine } from '../src/live/tradingEngine';
import { NotificationManager } from '../src/live/notificationManager';

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
      notifyTrade: jest.fn(),
      notify: jest.fn()
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
      await (engine as any).closePosition(token);
    }
    // Check consecutive-loss alert fired
    expect(notificationManager.notify).toHaveBeenCalledWith(
      expect.stringContaining('3 Consecutive Losing Trades'),
      'errors'
    );
    // Simulate drawdown breach
    (engine as any).currentBalance = 880; // 12% drawdown
    (engine as any).highWaterMark = 1000;
    const token = 'DRAWDOWN';
    const position: any = {
      entryPrice: 100,
      currentPrice: 90,
      size: 1,
      status: 'open',
    };
    (engine as any).positions.set(token, position);
    await (engine as any).closePosition(token);
    // Check drawdown alert fired
    expect(notificationManager.notify).toHaveBeenCalledWith(
      expect.stringContaining('Drawdown Breach'),
      'errors'
    );
  });
});
