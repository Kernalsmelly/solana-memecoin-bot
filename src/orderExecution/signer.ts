import { Transaction, VersionedTransaction, Connection, PublicKey, Keypair } from '@solana/web3.js';

export type AnySolanaTx = Transaction | VersionedTransaction;

export interface Signer {
  publicKey: PublicKey;
  signAndSendTransaction(tx: AnySolanaTx, connection: Connection): Promise<string>;
}

// Mock signer for dry-run mode
export class MockSigner implements Signer {
  public publicKey: PublicKey;
  constructor(pubkey?: string) {
    this.publicKey = new PublicKey(pubkey || 'So11111111111111111111111111111111111111112');
  }
  async signAndSendTransaction(tx: Transaction, connection: Connection): Promise<string> {
    // Simulate sending, return fake signature
    return 'mock_signature_' + Math.random().toString(36).slice(2);
  }
}

// EnvVar-based signer for live mode (uses private key from env)
export class EnvVarSigner implements Signer {
  public publicKey: PublicKey;
  private keypair: Keypair;
  constructor() {
    const secret = process.env.SOLANA_PRIVATE_KEY;
    if (!secret) throw new Error('Missing SOLANA_PRIVATE_KEY');
    const arr = secret.split(',').map(Number);
    this.keypair = Keypair.fromSecretKey(new Uint8Array(arr));
    this.publicKey = this.keypair.publicKey;
  }
  async signAndSendTransaction(tx: Transaction | VersionedTransaction, connection: Connection): Promise<string> {
    if (tx instanceof Transaction) {
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      tx.feePayer = this.publicKey;
      tx.sign(this.keypair);
      const raw = tx.serialize();
      return await connection.sendRawTransaction(raw, { skipPreflight: false });
    } else if (tx instanceof (await import('@solana/web3.js')).VersionedTransaction) {
      // Assume already signed by Jupiter, just send
      const raw = tx.serialize();
      return await connection.sendRawTransaction(raw, { skipPreflight: false });
    } else {
      throw new Error('Unknown transaction type');
    }
  }
}

// LedgerSigner for hardware wallet support (stub)
export class LedgerSigner implements Signer {
  public publicKey: PublicKey;
  constructor() {
    // TODO: Implement Ledger hardware wallet integration
    // Use solana-ledger-wallet or similar library for production
    throw new Error('LedgerSigner not implemented yet');
  }
  async signAndSendTransaction(tx: Transaction, connection: Connection): Promise<string> {
    throw new Error('LedgerSigner not implemented yet');
  }
}
