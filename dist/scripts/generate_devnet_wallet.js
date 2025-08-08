// Generates a new Solana Devnet wallet and outputs all necessary info for .env
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const keypair = Keypair.generate();
const pubkey = keypair.publicKey.toBase58();
// @ts-ignore
const secretBase58 = bs58.encode(keypair.secretKey);
const secretArray = Array.from(keypair.secretKey);
console.log('--- Solana Devnet Wallet Generated ---');
console.log('Public Key:', pubkey);
console.log('Private Key (base58):', secretBase58);
console.log('Private Key (JSON array):', JSON.stringify(secretArray));
// Save to disk for reference
fs.writeFileSync('devnet-keypair.json', JSON.stringify(secretArray));
fs.writeFileSync('devnet-wallet-info.txt', `Public Key: ${pubkey}\nPrivate Key (base58): ${secretBase58}\nPrivate Key (JSON array): ${JSON.stringify(secretArray)}\n`);
console.log('\nSaved devnet-keypair.json and devnet-wallet-info.txt in scripts/.');
console.log('Paste the base58 private key into your .env as WALLET_SECRET_BASE58=...');
export {};
//# sourceMappingURL=generate_devnet_wallet.js.map