import 'dotenv/config';
import { readFileSync } from 'fs';
import { Keypair, Connection } from '@solana/web3.js';
import fetch from 'node-fetch';
const rpcUrls = process.env.RPC_URLS.split(',');
const keypairPath = process.env.WALLET_KEYPAIR_PATH;
const secret = JSON.parse(readFileSync(keypairPath, 'utf8'));
const kp = Keypair.fromSecretKey(new Uint8Array(secret));
const pubkey = kp.publicKey;
const seedMint = process.env.SEED_TOKENS.split(',')[0];
async function getBalanceWithFallback(urls, pubkey) {
    for (const url of urls) {
        try {
            const conn = new Connection(url, 'confirmed');
            const bal = await conn.getBalance(pubkey);
            return bal;
        }
        catch (e) {
            // Try next RPC
        }
    }
    throw new Error('All RPCs failed');
}
async function getTokenPrice(mint) {
    try {
        const url = `https://public-api.birdeye.so/public/price?address=${mint}`;
        const resp = await fetch(url, { headers: { 'x-chain': 'solana' } });
        const data = await resp.json();
        return data.data?.value || null;
    }
    catch {
        return null;
    }
}
(async () => {
    const balanceLamports = await getBalanceWithFallback(rpcUrls, pubkey);
    const balanceSol = balanceLamports / 1e9;
    const price = seedMint ? await getTokenPrice(seedMint) : 0;
    console.log('Balance:', balanceSol, 'SOL');
    console.log('Price(seed):', price);
})();
//# sourceMappingURL=ping_mainnet.js.map