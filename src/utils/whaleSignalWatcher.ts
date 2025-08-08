import { Connection, PublicKey } from '@solana/web3.js';
import EventEmitter from 'events';

export interface WhaleSignalEvent {
  tokenMint: string;
  poolAddress: string;
  usdcAmount: number;
  slot: number;
  blockTime: number | null;
}

function isParsedInstruction(ix: any): ix is { parsed: { type: string; info: any } } {
  return (
    typeof ix === 'object' &&
    ix !== null &&
    'parsed' in ix &&
    ix.parsed &&
    typeof ix.parsed === 'object' &&
    'type' in ix.parsed &&
    ix.parsed.type === 'transfer' &&
    'info' in ix.parsed
  );
}

export class WhaleSignalWatcher extends EventEmitter {
  private connection: Connection;
  private usdcMint: string;
  private threshold: number;
  private seenPools: Set<string> = new Set();

  constructor(connection: Connection, usdcMint: string, threshold: number = 50000) {
    super();
    this.connection = connection;
    this.usdcMint = usdcMint;
    this.threshold = threshold;
  }

  public start() {
    // Subscribe to all USDC Transfer events
    this.connection.onLogs(
      'all',
      async (logs, ctx) => {
        try {
          const tx = await this.connection.getParsedTransaction(logs.signature, {
            commitment: 'confirmed',
          });
          if (!tx) return;
          for (const ix of tx.transaction.message.instructions) {
            // Only look for USDC transfers
            if (
              ix.programId &&
              ix.programId.toBase58() === this.usdcMint &&
              isParsedInstruction(ix)
            ) {
              const amount = Number(ix.parsed.info.amount) / 1e6; // USDC decimals
              const dest = ix.parsed.info.destination;
              if (amount >= this.threshold && dest && !this.seenPools.has(dest)) {
                this.seenPools.add(dest);
                this.emit('whaleSignal', {
                  tokenMint: this.usdcMint,
                  poolAddress: dest,
                  usdcAmount: amount,
                  slot: tx.slot,
                  blockTime: tx.blockTime || null,
                } as WhaleSignalEvent);
              }
            }
          }
        } catch {}
      },
      'confirmed',
    );
  }
}
