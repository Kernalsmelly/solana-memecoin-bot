import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../src/utils/config.js';
// Import or copy the getWalletBalance logic from fundManager
// import { getWalletBalance } from '../utils/fundManager';
// TODO: getWalletBalance implementation missing. Please provide or restore fundManager.ts.
import 'dotenv/config';
async function main() {
    // Load wallet from SOLANA_PRIVATE_KEY in .env
    const keyArray = process.env.SOLANA_PRIVATE_KEY;
    if (!keyArray) {
        console.error('SOLANA_PRIVATE_KEY not set in .env');
        process.exit(1);
    }
    let secretKey;
    try {
        secretKey = new Uint8Array(keyArray.split(',').map(Number));
    }
    catch {
        console.error('Invalid SOLANA_PRIVATE_KEY format; expected comma-separated numbers');
        process.exit(1);
    }
    const wallet = Keypair.fromSecretKey(secretKey);
    const connection = new Connection(config.solana.rpcEndpoint, 'confirmed');
    try {
        const balanceLamports = await connection.getBalance(wallet.publicKey);
        const balanceSol = balanceLamports / 1e9;
        console.log('\n===== WALLET BALANCE REPORT =====');
        console.log('Wallet Public Key:', wallet.publicKey.toBase58());
        console.log('SOL Balance:', balanceSol);
        // Fetch SPL token balances
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
            programId: new (await import('@solana/web3.js')).PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        });
        if (tokenAccounts.value.length === 0) {
            console.log('No SPL tokens found.');
        }
        else {
            console.log('--- SPL Token Balances ---');
            for (const { account } of tokenAccounts.value) {
                const info = account.data.parsed.info;
                const mint = info.mint;
                const amount = info.tokenAmount.uiAmountString;
                const decimals = info.tokenAmount.decimals;
                console.log(`Token Mint: ${mint}`);
                console.log(`  Amount: ${amount} (decimals: ${decimals})`);
            }
        }
        console.log('=================================\n');
    }
    catch (err) {
        console.error('Error fetching wallet balance:', err);
    }
}
main();
//# sourceMappingURL=checkWalletBalance.js.map