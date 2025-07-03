import { describe, it, expect, vi } from 'vitest';
import { isLiveMode } from '../utils/liveMode';
import { MockSigner } from '../../orderExecution/signer';
import { OrderManager } from '../../orderExecution/orderManager';

// Mock Connection to ensure no real RPC calls
class FakeConnection {
  getSignatureStatuses = vi.fn().mockResolvedValue({ value: [{ confirmationStatus: 'confirmed' }] });
  getRecentBlockhash = vi.fn().mockResolvedValue({ feeCalculator: { lamportsPerSignature: 5000 } });
  sendRawTransaction = vi.fn().mockResolvedValue('mock_sig');
}

describe('Integration: dry-run pipeline (LIVE_MODE=false)', () => {
  it('does not make real RPC calls', async () => {
    process.env.LIVE_MODE = 'false';
    const signer = new MockSigner();
    const connection = new FakeConnection();
    const orderManager = new OrderManager(connection as any, signer);
    const tx = {} as any;
    const sig = await orderManager.placeOrder(tx);
    expect(sig.startsWith('mock_signature_')).toBe(true);
    expect(connection.sendRawTransaction).not.toHaveBeenCalled();
  });
});
