import { describe, it, expect, vi } from 'vitest';
import { DryRunOrderExecution } from '../../src/orderExecution/index';
import { handleDryRunFill } from '../../src/orderExecution/dryRunFill';

describe('DryRunOrderExecution', () => {
  it('simulates a Jupiter swap and logs unsigned tx', async () => {
    const dryRun = new DryRunOrderExecution();
    const params = {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'USDC111111111111111111111111111111111111111',
      amountIn: 1000,
      slippageBps: 50,
      userPublicKey: 'user111',
      meta: { test: true }
    };
    let eventEmitted = false;
    dryRun.on('dryRunSwap', (tx) => {
      eventEmitted = true;
      expect(tx.inputMint).toBe(params.inputMint);
      expect(tx.outputMint).toBe(params.outputMint);
      expect(tx.amountIn).toBe(params.amountIn);
      expect(tx.user).toBe(params.userPublicKey);
    });
    const result = await dryRun.executeSwap(params);
    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(eventEmitted).toBe(true);
    expect(result.txLog.inputMint).toBe(params.inputMint);
  });
});

describe('handleDryRunFill', () => {
  it('calls riskManager.recordTrade and logs fill', async () => {
    const mockRecordTrade = vi.fn();
    vi.doMock('../../live/riskManager', () => ({ default: { recordTrade: mockRecordTrade } }));
    const params = {
      action: 'buy',
      tokenAddress: 'tok111',
      tokenSymbol: 'MEME',
      quantity: 100,
      price: 0.05,
      meta: { dry: true }
    };
    await handleDryRunFill(params, { recordTrade: mockRecordTrade });
    expect(mockRecordTrade).toHaveBeenCalled();
  });
});
