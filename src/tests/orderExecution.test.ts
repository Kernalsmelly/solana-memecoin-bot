import { describe, test, expect } from 'vitest';
import { createOrderExecution } from '../orderExecution';
import { Connection } from '@solana/web3.js';

describe('OrderExecution', () => {
  const dummyConnection = {} as Connection;
  const orderExecution = createOrderExecution(dummyConnection);

  test('executes a mock trade order successfully', async () => {
    const tradeOrder = {
      tokenAddress: 'So11111111111111111111111111111111111111112',
      side: 'buy',
      size: 100,
      price: 0.01
    };
    const result = await orderExecution.executeOrder(tradeOrder);
    expect(result.success).toBeTruthy();
    expect(result.txSignature).toMatch(/^mock_tx_/);
  });

  test('stop method does not throw', () => {
    expect(() => orderExecution.stop()).not.toThrow();
  });
});
