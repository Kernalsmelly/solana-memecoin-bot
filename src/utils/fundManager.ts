import * as dotenv from 'dotenv';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'; // Corrected import path again
import * as bs58 from 'bs58';
import logger from './logger';
import { sendAlert } from './notifications';

dotenv.config();

interface FundManagementOptions {
  action: 'deposit' | 'withdraw' | 'check' | 'rebalance';
  amount?: number;
  destinationAddress?: string;
  token?: string;
  saveReport?: boolean;
  notifyTransfer?: boolean;
  connection?: Connection;
  wallet?: Keypair;
}

interface TokenBalance {
  symbol: string;
  tokenAddress: string;
  balance: number;
  estimatedValueUsd: number;
}

interface PortfolioReport {
  timestamp: string;
  solBalance: number;
  usdcBalance: number;
  tokens: TokenBalance[];
  totalValueUsd: number;
}

// Mapping for common tokens we might use
const TOKEN_ADDRESSES: { [key: string]: string | undefined; SOL: string; USDC: string; USDT: string; BTC: string; } = {
  SOL: 'native',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BTC: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E'
};

/**
 * Get wallet balance information
 */
async function getWalletBalance(connection: Connection, wallet: Keypair): Promise<PortfolioReport> {
  // Get SOL balance
  const solBalance = await connection.getBalance(wallet.publicKey) / 1e9;
  
  // Get token accounts 
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    wallet.publicKey, 
    { programId: TOKEN_PROGRAM_ID }
  );
  
  // Initialize report
  const report: PortfolioReport = {
    timestamp: new Date().toISOString(),
    solBalance,
    usdcBalance: 0,
    tokens: [],
    totalValueUsd: solBalance * 70 // Simple conversion - in production you'd use an oracle
  };
  
  // Process token accounts
  for (const account of tokenAccounts.value) {
    const tokenAddress = account.account.data.parsed.info.mint;
    const tokenBalance = Number(account.account.data.parsed.info.tokenAmount.amount) / 
      10 ** account.account.data.parsed.info.tokenAmount.decimals;
    
    // Get symbol - in production you'd use a token registry
    let symbol = Object.keys(TOKEN_ADDRESSES).find(
      key => TOKEN_ADDRESSES[key] === tokenAddress
    ) || 'Unknown';
    
    // Calculate estimated value - in production you'd use an oracle
    let estimatedValueUsd = 0;
    
    if (symbol === 'USDC' || symbol === 'USDT') {
      estimatedValueUsd = tokenBalance;
      if (symbol === 'USDC') {
        report.usdcBalance = tokenBalance;
      }
    } else if (symbol === 'BTC') {
      estimatedValueUsd = tokenBalance * 65000; // Example price
    } else {
      // For unknown tokens, assume small value
      estimatedValueUsd = tokenBalance * 0.1;
    }
    
    report.tokens.push({
      symbol,
      tokenAddress,
      balance: tokenBalance,
      estimatedValueUsd
    });
    
    report.totalValueUsd += estimatedValueUsd;
  }
  
  return report;
}

/**
 * Withdraw SOL or SPL tokens from the trading wallet
 */
async function withdrawFunds(
  connection: Connection,
  wallet: Keypair,
  destinationAddress: string,
  amount: number,
  tokenAddress?: string
): Promise<string> {
  const destinationPubkey = new PublicKey(destinationAddress);
  
  // Withdraw SOL
  if (!tokenAddress || tokenAddress === 'native' || tokenAddress === 'SOL') {
    const lamports = amount * 1e9; // Convert SOL to lamports
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: destinationPubkey,
        lamports
      })
    );
    
    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
    logger.info('SOL withdrawal completed', { amount, destination: destinationAddress, signature });
    return signature;
  } 
  // Withdraw SPL token
  else {
    const mint = new PublicKey(tokenAddress);
    const token = new Token(connection, mint, TOKEN_PROGRAM_ID, wallet);
    
    // Get source token account
    const sourceTokenAccount = await token.getOrCreateAssociatedAccountInfo(wallet.publicKey);
    
    // Get or create destination token account
    const destinationTokenAccount = await token.getOrCreateAssociatedAccountInfo(destinationPubkey);
    
    // Get mint info to determine decimals
    const mintInfo = await token.getMintInfo();
    
    // Transfer tokens
    const signature = await token.transfer(
      sourceTokenAccount.address,
      destinationTokenAccount.address,
      wallet.publicKey, // Authority should be wallet public key
      [],
      amount * Math.pow(10, mintInfo.decimals) // Use decimals from mint info
    );
    
    logger.info('Token withdrawal completed', { 
      token: tokenAddress, 
      amount, 
      destination: destinationAddress,
      signature 
    });
    
    return signature;
  }
}

/**
 * Rebalance trading wallet based on preset ratios
 * In production, implement proper rebalancing logic
 */
async function rebalancePortfolio(connection: Connection, wallet: Keypair): Promise<boolean> {
  try {
    // Get current balances
    const portfolio = await getWalletBalance(connection, wallet);
    
    logger.info('Portfolio before rebalancing', portfolio);
    
    // For this example, we'll just check if we have enough USDC for trading
    // In a real system, you'd implement proper position sizing logic
    
    // Minimum USDC required for trading
    const minUsdcRequired = Number(process.env.MIN_USDC_REQUIRED || 100);
    
    // If USDC balance is below threshold and we have enough SOL, swap some SOL for USDC
    if (portfolio.usdcBalance < minUsdcRequired && portfolio.solBalance > 0.2) {
      // In production, implement a swap from SOL to USDC using your DEX integration
      logger.info('USDC balance below threshold, recommend swapping SOL to USDC');
      
      // For now, we just log a notification
      await sendAlert(
        `Trading wallet needs rebalancing. USDC: $${portfolio.usdcBalance.toFixed(2)}, Required: $${minUsdcRequired}`,
        'WARNING'
      );
      
      return false; // Manual intervention needed
    }
    
    logger.info('Portfolio is balanced correctly');
    return true;
  } catch (error) {
    logger.error('Error during portfolio rebalancing', error);
    return false;
  }
}

/**
 * Main fund management function
 */
export async function manageFunds(options: FundManagementOptions): Promise<any> {
  const { 
    action, 
    amount, 
    destinationAddress, 
    token, 
    saveReport, 
    notifyTransfer,
    connection, 
    wallet 
  } = options;
  
  // Validate connection and wallet if needed for the action
  if ((action === 'check' || action === 'withdraw' || action === 'rebalance') && (!connection || !wallet)) {
    logger.error('Connection and wallet must be provided for check, withdraw, or rebalance actions');
    throw new Error('Connection and wallet required for this action');
  }

  try {
    // Validate environment and parameters
    if (action === 'withdraw' && (!destinationAddress || !amount)) {
      throw new Error('Withdrawal requires destination address and amount');
    }
    
    // Resolve token address if provided as symbol
    let tokenAddress = token;
    if (tokenAddress && TOKEN_ADDRESSES[tokenAddress]) {
      tokenAddress = TOKEN_ADDRESSES[tokenAddress];
    }
    
    // Execute requested action
    switch (action) {
      case 'check':
        logger.info('Checking wallet balance...');
        // Use provided connection and wallet
        const report = await getWalletBalance(connection!, wallet!);
        logger.info('Wallet Balance Report', report);
        if (saveReport) {
          const fs = require('fs');
          const reportsDir = './reports';
          if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
          }
          fs.writeFileSync(
            `${reportsDir}/portfolio-${Date.now()}.json`,
            JSON.stringify(report, null, 2)
          );
        }
        return report;
        
      case 'withdraw':
        const signature = await withdrawFunds(
          connection!,
          wallet!,
          destinationAddress!,
          amount!,
          tokenAddress
        );
        
        if (notifyTransfer) {
          await sendAlert(
            `Funds withdrawn: ${amount} ${tokenAddress || 'SOL'} to ${destinationAddress}`,
            'INFO'
          );
        }
        
        return { success: true, signature };
        
      case 'rebalance':
        const success = await rebalancePortfolio(connection!, wallet!);
        return { success };
        
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Fund management operation failed:', errorMessage);
    
    await sendAlert(`Fund management failed: ${errorMessage}`, 'ERROR');
    return { success: false, error: errorMessage };
  }
}

// Run when invoked directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const action = args[0] as 'deposit' | 'withdraw' | 'check' | 'rebalance';
  
  const options: FundManagementOptions = { action };
  
  // Parse additional arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--amount=')) {
      options.amount = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--to-address=')) {
      options.destinationAddress = arg.split('=')[1];
    } else if (arg.startsWith('--token=')) {
      options.token = arg.split('=')[1];
    } else if (arg === '--save-report') {
      options.saveReport = true;
    } else if (arg === '--notify') {
      options.notifyTransfer = true;
    }
  }
  
  (async () => {
    console.log(`Executing fund management: ${action}`);
    const result = await manageFunds(options);
    
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })();
}

export default manageFunds;
