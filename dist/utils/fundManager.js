"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.manageFunds = manageFunds;
const dotenv = __importStar(require("dotenv"));
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token"); // Corrected import path again
const logger_1 = __importDefault(require("./logger"));
const notifications_1 = require("./notifications");
dotenv.config();
// Mapping for common tokens we might use
const TOKEN_ADDRESSES = {
    SOL: 'native',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    BTC: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E'
};
/**
 * Get wallet balance information
 */
async function getWalletBalance(connection, wallet) {
    // Get SOL balance
    const solBalance = await connection.getBalance(wallet.publicKey) / 1e9;
    // Get token accounts 
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { programId: spl_token_1.TOKEN_PROGRAM_ID });
    // Initialize report
    const report = {
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
        let symbol = Object.keys(TOKEN_ADDRESSES).find(key => TOKEN_ADDRESSES[key] === tokenAddress) || 'Unknown';
        // Calculate estimated value - in production you'd use an oracle
        let estimatedValueUsd = 0;
        if (symbol === 'USDC' || symbol === 'USDT') {
            estimatedValueUsd = tokenBalance;
            if (symbol === 'USDC') {
                report.usdcBalance = tokenBalance;
            }
        }
        else if (symbol === 'BTC') {
            estimatedValueUsd = tokenBalance * 65000; // Example price
        }
        else {
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
async function withdrawFunds(connection, wallet, destinationAddress, amount, tokenAddress) {
    const destinationPubkey = new web3_js_1.PublicKey(destinationAddress);
    // Withdraw SOL
    if (!tokenAddress || tokenAddress === 'native' || tokenAddress === 'SOL') {
        const lamports = amount * 1e9; // Convert SOL to lamports
        const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: destinationPubkey,
            lamports
        }));
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(connection, transaction, [wallet]);
        logger_1.default.info('SOL withdrawal completed', { amount, destination: destinationAddress, signature });
        return signature;
    }
    // Withdraw SPL token
    else {
        const mint = new web3_js_1.PublicKey(tokenAddress);
        const token = new spl_token_1.Token(connection, mint, spl_token_1.TOKEN_PROGRAM_ID, wallet);
        // Get source token account
        const sourceTokenAccount = await token.getOrCreateAssociatedAccountInfo(wallet.publicKey);
        // Get or create destination token account
        const destinationTokenAccount = await token.getOrCreateAssociatedAccountInfo(destinationPubkey);
        // Get mint info to determine decimals
        const mintInfo = await token.getMintInfo();
        // Transfer tokens
        const signature = await token.transfer(sourceTokenAccount.address, destinationTokenAccount.address, wallet.publicKey, // Authority should be wallet public key
        [], amount * Math.pow(10, mintInfo.decimals) // Use decimals from mint info
        );
        logger_1.default.info('Token withdrawal completed', {
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
async function rebalancePortfolio(connection, wallet) {
    try {
        // Get current balances
        const portfolio = await getWalletBalance(connection, wallet);
        logger_1.default.info('Portfolio before rebalancing', portfolio);
        // For this example, we'll just check if we have enough USDC for trading
        // In a real system, you'd implement proper position sizing logic
        // Minimum USDC required for trading
        const minUsdcRequired = Number(process.env.MIN_USDC_REQUIRED || 100);
        // If USDC balance is below threshold and we have enough SOL, swap some SOL for USDC
        if (portfolio.usdcBalance < minUsdcRequired && portfolio.solBalance > 0.2) {
            // In production, implement a swap from SOL to USDC using your DEX integration
            logger_1.default.info('USDC balance below threshold, recommend swapping SOL to USDC');
            // For now, we just log a notification
            await (0, notifications_1.sendAlert)(`Trading wallet needs rebalancing. USDC: $${portfolio.usdcBalance.toFixed(2)}, Required: $${minUsdcRequired}`, 'WARNING');
            return false; // Manual intervention needed
        }
        logger_1.default.info('Portfolio is balanced correctly');
        return true;
    }
    catch (error) {
        logger_1.default.error('Error during portfolio rebalancing', error);
        return false;
    }
}
/**
 * Main fund management function
 */
async function manageFunds(options) {
    const { action, amount, destinationAddress, token, saveReport, notifyTransfer, connection, wallet } = options;
    // Validate connection and wallet if needed for the action
    if ((action === 'check' || action === 'withdraw' || action === 'rebalance') && (!connection || !wallet)) {
        logger_1.default.error('Connection and wallet must be provided for check, withdraw, or rebalance actions');
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
                logger_1.default.info('Checking wallet balance...');
                // Use provided connection and wallet
                const report = await getWalletBalance(connection, wallet);
                logger_1.default.info('Wallet Balance Report', report);
                if (saveReport) {
                    const fs = require('fs');
                    const reportsDir = './reports';
                    if (!fs.existsSync(reportsDir)) {
                        fs.mkdirSync(reportsDir, { recursive: true });
                    }
                    fs.writeFileSync(`${reportsDir}/portfolio-${Date.now()}.json`, JSON.stringify(report, null, 2));
                }
                return report;
            case 'withdraw':
                const signature = await withdrawFunds(connection, wallet, destinationAddress, amount, tokenAddress);
                if (notifyTransfer) {
                    await (0, notifications_1.sendAlert)(`Funds withdrawn: ${amount} ${tokenAddress || 'SOL'} to ${destinationAddress}`, 'INFO');
                }
                return { success: true, signature };
            case 'rebalance':
                const success = await rebalancePortfolio(connection, wallet);
                return { success };
            default:
                throw new Error(`Unsupported action: ${action}`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Fund management operation failed:', errorMessage);
        await (0, notifications_1.sendAlert)(`Fund management failed: ${errorMessage}`, 'ERROR');
        return { success: false, error: errorMessage };
    }
}
// Run when invoked directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const action = args[0];
    const options = { action };
    // Parse additional arguments
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--amount=')) {
            options.amount = parseFloat(arg.split('=')[1]);
        }
        else if (arg.startsWith('--to-address=')) {
            options.destinationAddress = arg.split('=')[1];
        }
        else if (arg.startsWith('--token=')) {
            options.token = arg.split('=')[1];
        }
        else if (arg === '--save-report') {
            options.saveReport = true;
        }
        else if (arg === '--notify') {
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
exports.default = manageFunds;
