import { Transaction, Connection, PublicKey, Signer as Web3Signer } from '@solana/web3.js';

export interface Signer {
  publicKey: PublicKey;
  signAndSendTransaction(tx: Transaction, connection: Connection): Promise<string>;
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
  private keypair: Web3Signer;
  constructor() {
    const secret = process.env.SOLANA_PRIVATE_KEY;
    if (!secret) throw new Error('Missing SOLANA_PRIVATE_KEY');
    const arr = secret.split(',').map(Number);
    // @ts-ignore
    this.keypair = Web3Signer.fromSecretKey(new Uint8Array(arr));
    this.publicKey = this.keypair.publicKey;
  }
  async signAndSendTransaction(tx: Transaction, connection: Connection): Promise<string> {
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = this.publicKey;
    tx.sign(this.keypair);
    const raw = tx.serialize();
    return await connection.sendRawTransaction(raw, { skipPreflight: false });
  }
}

// (Optional) LedgerSigner for hardware wallet support can be added here
