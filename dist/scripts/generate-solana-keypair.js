// Usage:
//   node scripts/generate-solana-keypair.js             # Generate new keypair
//   node scripts/generate-solana-keypair.js --print-public-from-env  # Print public key from SOLANA_PRIVATE_KEY in .env
//   node scripts/generate-solana-keypair.js --print-public           # Print public key for a newly generated keypair
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const args = process.argv.slice(2);
if (args.includes('--print-public-from-env')) {
    // Load .env
    const envPath = path.resolve(__dirname, '../.env');
    const env = dotenv.parse(fs.readFileSync(envPath));
    const keyStr = env.SOLANA_PRIVATE_KEY;
    if (!keyStr) {
        console.error('SOLANA_PRIVATE_KEY not found in .env');
        process.exit(1);
    }
    const secretKey = Uint8Array.from(keyStr.split(',').map((x) => parseInt(x.trim(), 10)));
    const kp = Keypair.fromSecretKey(secretKey);
    console.log('Public Key:', kp.publicKey.toBase58());
    process.exit(0);
}
const kp = Keypair.generate();
console.log(kp.secretKey.toString());
if (args.includes('--print-public')) {
    console.log('Public Key:', kp.publicKey.toBase58());
}
export {};
//# sourceMappingURL=generate-solana-keypair.js.map