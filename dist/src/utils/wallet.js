import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();
const keyArray = process.env.SOLANA_PRIVATE_KEY;
if (!keyArray)
    throw new Error('SOLANA_PRIVATE_KEY not set');
let secretKey;
// Try base58 first, then fallback to comma-separated array
try {
    if (/^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(keyArray.trim())) {
        // Looks like base58
        secretKey = bs58.decode(keyArray.trim());
    }
    else {
        // Try comma-separated array
        secretKey = new Uint8Array(keyArray.split(',').map(Number));
    }
}
catch (err) {
    throw new Error('Invalid SOLANA_PRIVATE_KEY format; must be base58 string or comma-separated numbers. Original error: ' + (err instanceof Error ? err.message : String(err)));
}
if (secretKey.length !== 64) {
    throw new Error(`Invalid secret key length: expected 64 bytes, got ${secretKey.length}.`);
}
export const walletKeypair = Keypair.fromSecretKey(secretKey);
console.log('[WALLET DEBUG] Loaded wallet public key:', walletKeypair.publicKey.toBase58());
//# sourceMappingURL=wallet.js.map