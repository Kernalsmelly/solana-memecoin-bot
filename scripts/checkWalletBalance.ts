import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../src/utils/config';
import * as fs from 'fs';

// Import or copy the getWalletBalance logic from fundManager
import { getWalletBalance } from '../src/utils/fundManager';

async function main() {
  // Load wallet from config
  const secretKey = JSON.parse(fs.readFileSync(process.env.SOLANA_WALLET || './wallet.json', 'utf8'));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const connection = new Connection(config.solana.rpcEndpoint, 'confirmed');

  try {
    const report = await getWalletBalance(connection, wallet);
    console.log('\n===== WALLET BALANCE REPORT =====');
    console.log(`SOL: ${report.solBalance}`);
    console.log(`USDC: ${report.usdcBalance}`);
    console.log('Other tokens:', report.tokens);
    console.log(`Total Estimated Value (USD): $${report.totalValueUsd}`);
    console.log('=================================\n');
  } catch (err) {
    console.error('Error fetching wallet balance:', err);
  }
}

main();
