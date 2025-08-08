// Generates a new Solana Devnet wallet and outputs all necessary info for .env (ESM version)
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { writeFileSync } from 'fs';
const keypair = Keypair.generate();
const pubkey = keypair.publicKey.toBase58();
const secretBase58 = bs58.encode(keypair.secretKey);
const secretArray = Array.from(keypair.secretKey);
console.log('--- Solana Devnet Wallet Generated ---');
console.log('Public Key:', pubkey);
console.log('Private Key (base58):', secretBase58);
console.log('Private Key (JSON array):', JSON.stringify(secretArray));
// Save to disk for reference
writeFileSync('scripts/devnet-keypair.json', JSON.stringify(secretArray));
writeFileSync('scripts/devnet-wallet-info.txt', `Public Key: ${pubkey}\nPrivate Key (base58): ${secretBase58}\nPrivate Key (JSON array): ${JSON.stringify(secretArray)}\n`);
console.log('\nSaved devnet-keypair.json and devnet-wallet-info.txt in scripts/.');
console.log('Paste the base58 private key into your .env as WALLET_SECRET_BASE58=...');
//# sourceMappingURL=generate_devnet_wallet.mjs.map