import { Connection, PublicKey } from '@solana/web3.js';

// Replace with your actual RPC endpoint if different
const RPC_URL =
  'https://tame-convincing-orb.solana-mainnet.quiknode.pro/8c0fdb1b94a5ceea4703d6f10593034ab640a413/';
const RAYDIUM_LP_V4_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

(async () => {
  const connection = new Connection(RPC_URL, 'confirmed');
  try {
    console.log('Requesting Raydium AMM program accounts...');
    const accounts = await connection.getProgramAccounts(RAYDIUM_LP_V4_PROGRAM_ID);
    console.log(`Success! Found ${accounts.length} Raydium AMM program accounts.`);
  } catch (err) {
    console.error('Error while calling getProgramAccounts:', err);
  }
})();
