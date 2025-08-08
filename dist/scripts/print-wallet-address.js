import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();
const key = process.env.SOLANA_PRIVATE_KEY;
if (!key)
    throw new Error('SOLANA_PRIVATE_KEY not set');
let secretKey;
if (/^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(key.trim())) {
    secretKey = bs58.decode(key.trim());
}
else {
    secretKey = new Uint8Array(key.split(',').map(Number));
}
if (secretKey.length !== 64)
    throw new Error('Invalid secret key length: expected 64 bytes, got ' + secretKey.length);
const kp = Keypair.fromSecretKey(secretKey);
console.log('Wallet public key:', kp.publicKey.toBase58());
//# sourceMappingURL=print-wallet-address.js.map