import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.SOLANA_PRIVATE_KEY;
if (!key) throw new Error('SOLANA_PRIVATE_KEY not set');

let secretKey: Uint8Array;
import bs58 from 'bs58';

if (/^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(key.trim())) {
  secretKey = bs58.decode(key.trim());
} else {
  secretKey = new Uint8Array(key.split(',').map(Number));
}
if (secretKey.length !== 64) throw new Error('Invalid secret key length: expected 64 bytes, got ' + secretKey.length);

const publicKey = new PublicKey(secretKey.slice(32));

const MAINNET_RPC = process.env.QUICKNODE_RPC_URL || process.env.RPC_URLS?.split(',')[0] || 'https://api.mainnet-beta.solana.com';

async function main() {
  const conn = new Connection(MAINNET_RPC, 'confirmed');
  const bal = await conn.getBalance(publicKey);
  console.log('Wallet:', publicKey.toBase58());
  console.log('Balance:', bal / 1e9, 'SOL');
}

main();
