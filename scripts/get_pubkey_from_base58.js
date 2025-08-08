// Usage: node scripts/get_pubkey_from_base58.js <base58-privkey>
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');

const base58 = process.argv[2];
if (!base58) {
  console.error('Usage: node scripts/get_pubkey_from_base58.js <base58-privkey>');
  process.exit(1);
}
const secret = bs58.decode(base58);
const pubkey = Keypair.fromSecretKey(secret).publicKey.toBase58();
console.log(pubkey);
