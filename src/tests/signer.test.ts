import { describe, it, expect } from 'vitest';
import { MockSigner, EnvVarSigner, LedgerSigner } from '../orderExecution/signer';
import { PublicKey, Transaction, Connection, Keypair } from '@solana/web3.js';

describe('Signer Implementations', () => {
  it('MockSigner returns fake signature', async () => {
    const signer = new MockSigner();
    const tx = new Transaction();
    const connection = {} as Connection;
    const sig = await signer.signAndSendTransaction(tx, connection);
    expect(sig).toMatch(/^mock_signature_/);
  });

  it('EnvVarSigner throws if no key', () => {
    const orig = process.env.SOLANA_PRIVATE_KEY;
    delete process.env.SOLANA_PRIVATE_KEY;
    expect(() => new EnvVarSigner()).toThrow();
    process.env.SOLANA_PRIVATE_KEY = orig;
  });

  it('LedgerSigner throws not implemented', async () => {
    expect(() => new LedgerSigner()).toThrow('LedgerSigner not implemented yet');
  });

  it('EnvVarSigner signs and sends (mocked)', async () => {
    // Use a real random Keypair for the env var
    const kp = Keypair.generate();
    process.env.SOLANA_PRIVATE_KEY = Array.from(kp.secretKey).join(',');
    const signer = new EnvVarSigner();
    // Mock connection
    const connection = {
      getLatestBlockhash: async () => ({ blockhash: '11111111111111111111111111111111' }), // valid 32-byte base58
      sendRawTransaction: async () => 'real_sig_123',
    } as any;
    const tx = new Transaction();
    const sig = await signer.signAndSendTransaction(tx, connection);
    expect(sig).toBe('real_sig_123');
  });
});
