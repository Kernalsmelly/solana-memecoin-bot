var sendAlertSpy;
vi.mock('../src/utils/notifications', () => {
  sendAlertSpy = vi.fn((...args) => {
    // eslint-disable-next-line no-console
    console.log('[TEST DEBUG] sendAlert called with:', ...args);
    return Promise.resolve(true);
  });
  return { sendAlert: sendAlertSpy };
});

import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { TradingEngine } from '../src/services/tradingEngine';
import { sendAlert } from '../src/utils/notifications';

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
    // Mock Solana connection
    const mockConnection = {
      getFeeForMessage: async () => ({ value: 0 })
    };
    (engine as any).connection = mockConnection;
    // Mock feedbackLoop to prevent undefined error
    (engine as any).feedbackLoop = { addTrade: vi.fn() };
    // Mock tradeManager to prevent undefined error
    (engine as any).tradeManager = { addTrade: vi.fn() };
    // Mock wallet and riskManager
    (engine as any).wallet = { publicKey: { toString: () => 'walletpubkey' } };
    (engine as any).riskManager = { getDynamicPositionSizeSol: () => 1 };

    // Simulate 3 consecutive losses
    const tokens = [
      new PublicKey('So11111111111111111111111111111111111111112'),
      new PublicKey('So11111111111111111111111111111111111111113'),
      new PublicKey('So11111111111111111111111111111111111111114')
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
        pairAddress: 'So11111111111111111111111111111111111111112'
      };
      (engine as any).positions.set(token, position);
      // Simulate sell with negative PnL
      // eslint-disable-next-line no-console
      console.log('[TEST DEBUG] About to sellToken with mint:', token.toBase58(), typeof token);
      await (engine as any).sellToken(token, '', {
        symbol,
        currentPrice: 90,
        amount: 1,
        rawPnL: -10,
        liquidity: 1000,
        volume1h: 10000,
        buyRatio5m: 0.5,
        pairAddress: 'So11111111111111111111111111111111111111112',
        transaction: { message: { serialize: () => Buffer.from([]) } }
      });
    }
    // Check consecutive-loss alert fired
    expect(sendAlertSpy).toHaveBeenCalledWith(
      expect.stringContaining('consecutive losses'),
      'CRITICAL'
    );

    // Simulate drawdown breach
    (engine as any).runningPnL = 0;
    (engine as any).peakPnL = 10;
    (engine as any).consecutiveLosses = 0;
    // This sell triggers drawdown alert
    const drawdownToken = new PublicKey('So11111111111111111111111111111111111111115');
    await (engine as any).sellToken(drawdownToken, '', { symbol: 'DRAWDOWN', currentPrice: 80, amount: 1 });
    expect(sendAlertSpy).toHaveBeenCalledWith(
      'Drawdown Breach',
      'CRITICAL'
    );

  });
});
