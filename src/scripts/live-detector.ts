import { Connection } from '@solana/web3.js';
import { NewCoinDetector } from '../services/newCoinDetector.js';
import { Config, config as importedConfig } from '../utils/config.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Use the imported config directly
  const config: Config = importedConfig;

  // Determine RPC endpoint to use (Prioritize QuickNode if available)
  const rpcUrlToUse = config.apis?.quicknodeRpcUrl || config.solana.rpcEndpoint;
  console.log(`Using Solana RPC Endpoint: ${rpcUrlToUse}`);

  // Establish Solana connection
  const connection = new Connection(rpcUrlToUse, 'confirmed');
  console.log(`Established Solana connection to ${config.solana.cluster} cluster.`);

  // Initialize detector with live monitoring
  const detector = new NewCoinDetector(connection, config);

  // Subscribe to events
  detector.on('newToken', (token: any) => {
    console.log('\n🚀 New Token Detected:');
    console.log(JSON.stringify(token, null, 2));
  });

  detector.on('error', (error: any) => {
    console.error('\n❌ Error:', error);
  });

  // Start the detector
  detector.start();

  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\nShutting down detector...');
    detector.stop();
    process.exit();
  });

  console.log('\n🔍 Starting live token detection...');
  console.log('Press Ctrl+C to stop\n');
}

main().catch(console.error);
