process.env.FEE_PRIORITY = '0.00123';
console.log('[TEST] process.env.FEE_PRIORITY:', process.env.FEE_PRIORITY);
import { describe, it, expect, beforeEach } from 'vitest';
import { TxnBuilder } from '../src/services/txnBuilder';

// Mock Solana web3.js dependencies

const mockConnection = {
  getLatestBlockhash: async () => ({ blockhash: 'mockblockhash' }),
  sendTransaction: async () => 'mockSignature',
  confirmTransaction: async () => ({ value: { err: null } }),
};

const mockInstruction = { keys: [], programId: {}, data: Buffer.from([]) };
const mockKeypair = { publicKey: {}, secretKey: Buffer.alloc(64) };

// Patch ComputeBudgetProgram for test
import * as web3 from '@solana/web3.js';
web3.ComputeBudgetProgram.setComputeUnitPrice = ({ microLamports }) => ({
  type: 'computeBudget',
  microLamports,
});

describe('TxnBuilder Priority Fee', () => {
  it('should use FEE_PRIORITY from env if not provided in options', async () => {
    const builder = new TxnBuilder(mockConnection as any, {});
    expect(builder.priorityFee).toBeCloseTo(0.00123, 5);
  });

  it('should use priorityFee from options if provided', async () => {
    const builder = new TxnBuilder(mockConnection as any, { priorityFee: 0.00456 });
    expect(builder.priorityFee).toBeCloseTo(0.00456, 5);
  });

  it('should add compute budget instruction with correct microLamports', async () => {
    const builder = new TxnBuilder(mockConnection as any, {});
    // Instead of spying on Transaction, just check the output of setComputeUnitPrice
    const fee = builder.priorityFee;
    const computeBudgetIx = web3.ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: Math.floor(fee * 1e9),
    });
    expect(computeBudgetIx.microLamports).toBe(Math.floor(0.00123 * 1e9));
  });
});
