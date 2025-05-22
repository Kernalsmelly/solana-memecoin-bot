#!/usr/bin/env ts-node
"use strict";
/**
 * Configuration Validation Script
 *
 * This script validates all required environment variables and configuration
 * before the bot is started. It helps prevent runtime errors due to missing
 * or invalid configuration.
 */
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
const dotenv = __importStar(require("dotenv"));
const fs = __importStar(require("fs"));
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const path_1 = __importDefault(require("path")); // Import path module
// Load environment variables
dotenv.config();
const results = [];
// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};
async function main() {
    console.log(`${colors.cyan}=============================================${colors.reset}`);
    console.log(`${colors.cyan}      SolMemeBot Configuration Validator     ${colors.reset}`);
    console.log(`${colors.cyan}=============================================${colors.reset}\n`);
    // 1. Check for essential environment variables
    validateRequiredEnvVars();
    // 2. Validate Solana connection
    await validateSolanaConnection();
    // 3. Validate wallet
    await validateWallet();
    // 4. Validate Birdeye API (Skipped - Not currently used)
    // await validateBirdeyeAPI();
    // 5. Validate data directory
    validateDataDirectory();
    // 6. Validate numeric configurations
    validateNumericConfigs();
    // Display results
    console.log(`\n${colors.cyan}=============================================${colors.reset}`);
    console.log(`${colors.cyan}               Results Summary               ${colors.reset}`);
    console.log(`${colors.cyan}=============================================${colors.reset}\n`);
    const successCount = results.filter(r => r.status === 'success').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    results.forEach(result => {
        const statusColor = result.status === 'success' ? colors.green :
            result.status === 'warning' ? colors.yellow :
                colors.red;
        console.log(`${statusColor}[${result.status.toUpperCase()}]${colors.reset} ${result.name}: ${result.message}`);
    });
    // --- Write results to a log file ---
    const logFilePath = path_1.default.join(process.cwd(), 'validation_results.log');
    let logContent = 'Configuration Validation Results:\n';
    logContent += '=====================================\n';
    results.forEach(result => {
        logContent += `[${result.status.toUpperCase()}] ${result.name}: ${result.message}\n`;
    });
    logContent += '=====================================\n';
    logContent += `Summary: ${results.length} checks | ${successCount} passed | ${warningCount} warnings | ${errorCount} errors\n`;
    try {
        fs.writeFileSync(logFilePath, logContent);
        console.log(`\n${colors.blue}ℹ Validation results also written to: ${logFilePath}${colors.reset}`);
    }
    catch (writeError) {
        console.error(`${colors.red}✘ Error writing validation results to file: ${writeError instanceof Error ? writeError.message : String(writeError)}${colors.reset}`);
    }
    // --- End writing results to log file ---
    console.log(`\n${colors.cyan}=============================================${colors.reset}`);
    console.log(`Total: ${results.length} checks | ${colors.green}${successCount} passed${colors.reset} | ${colors.yellow}${warningCount} warnings${colors.reset} | ${colors.red}${errorCount} errors${colors.reset}`);
    console.log(`${colors.cyan}=============================================${colors.reset}\n`);
    // Exit with error code if any errors found
    if (errorCount > 0) {
        console.log(`${colors.red}✘ Configuration validation failed with ${errorCount} errors.${colors.reset}`);
        console.log(`${colors.red}✘ Please fix the issues above before starting the bot.${colors.reset}\n`);
        process.exit(1);
    }
    else if (warningCount > 0) {
        console.log(`${colors.yellow}⚠ Configuration validated with ${warningCount} warnings.${colors.reset}`);
        console.log(`${colors.yellow}⚠ You may want to review these before proceeding.${colors.reset}\n`);
        process.exit(0);
    }
    else {
        console.log(`${colors.green}✓ All configuration checks passed successfully!${colors.reset}\n`);
        process.exit(0);
    }
}
function validateRequiredEnvVars() {
    const requiredVars = [
        { name: 'SOLANA_RPC_URL', description: 'Solana RPC endpoint' },
        { name: 'SOLANA_PRIVATE_KEY', description: 'Private key for the trading wallet' },
        // { name: 'BIRDEYE_API_KEY', description: 'API key for Birdeye' }, // Removed requirement as Birdeye is not used
    ];
    const optionalVars = [
        { name: 'DATA_DIRECTORY', description: 'Directory for saving state files', defaultValue: './data' },
        { name: 'SAVE_INTERVAL_MINUTES', description: 'Interval for saving state', defaultValue: '5' },
        { name: 'LOG_LEVEL', description: 'Logging level', defaultValue: 'info' },
        { name: 'MIN_LIQUIDITY', description: 'Minimum liquidity for tokens', defaultValue: '5000' },
        { name: 'MAX_POSITION_SIZE', description: 'Maximum position size in USD', defaultValue: '50' },
        { name: 'MAX_LIQUIDITY_PERCENTAGE', description: 'Maximum percentage of token liquidity to use', defaultValue: '5' },
    ];
    // Check required variables
    requiredVars.forEach(v => {
        if (!process.env[v.name]) {
            results.push({
                name: v.name,
                status: 'error',
                message: `Missing required environment variable (${v.description})`
            });
        }
        else {
            results.push({
                name: v.name,
                status: 'success',
                message: 'Present'
            });
        }
    });
    // Check optional variables
    optionalVars.forEach(v => {
        if (!process.env[v.name]) {
            results.push({
                name: v.name,
                status: 'warning',
                message: `Missing optional variable, will use default: ${v.defaultValue} (${v.description})`
            });
        }
        else {
            results.push({
                name: v.name,
                status: 'success',
                message: 'Present'
            });
        }
    });
}
async function validateSolanaConnection() {
    const rpcUrl = process.env.SOLANA_RPC_URL;
    if (!rpcUrl)
        return; // Already reported as error
    try {
        const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
        const version = await connection.getVersion();
        results.push({
            name: 'Solana RPC Connection',
            status: 'success',
            message: `Connected successfully (${JSON.stringify(version)})`
        });
    }
    catch (err) {
        results.push({
            name: 'Solana RPC Connection',
            status: 'error',
            message: `Failed to connect: ${err instanceof Error ? err.message : String(err)}`
        });
    }
}
async function validateWallet() {
    const privateKeyString = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyString)
        return; // Already reported as error
    try {
        // Validate private key format
        const privateKey = bs58_1.default.decode(privateKeyString);
        if (privateKey.length !== 64) {
            results.push({
                name: 'Wallet Private Key',
                status: 'error',
                message: `Invalid private key length, expected 64 bytes but got ${privateKey.length}`
            });
            return;
        }
        // Try to connect to RPC and check balance
        const rpcUrl = process.env.SOLANA_RPC_URL;
        if (rpcUrl) {
            try {
                const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
                const secretKeyBytes = bs58_1.default.decode(privateKeyString);
                const account = web3_js_1.Keypair.fromSecretKey(secretKeyBytes);
                const balance = await connection.getBalance(account.publicKey);
                if (balance === 0) {
                    results.push({
                        name: 'Wallet Balance',
                        status: 'warning',
                        message: 'Wallet has zero SOL balance'
                    });
                }
                else {
                    const solBalance = balance / 1e9;
                    results.push({
                        name: 'Wallet Balance',
                        status: 'success',
                        message: `${solBalance.toFixed(4)} SOL available`
                    });
                }
            }
            catch (err) {
                results.push({
                    name: 'Wallet Balance Check',
                    status: 'error',
                    message: `Failed to check balance: ${err instanceof Error ? err.message : String(err)}`
                });
            }
        }
    }
    catch (err) {
        results.push({
            name: 'Wallet Private Key',
            status: 'error',
            message: `Invalid private key format: ${err instanceof Error ? err.message : String(err)}`
        });
    }
}
async function validateBirdeyeAPI() {
    const apiKey = process.env.BIRDEYE_API_KEY;
    if (!apiKey)
        return; // Already reported as error
    // Simple check for API key format
    if (apiKey.length < 20) {
        results.push({
            name: 'Birdeye API Key',
            status: 'warning',
            message: 'API key seems too short, please verify'
        });
        return;
    }
    results.push({
        name: 'Birdeye API Key',
        status: 'success',
        message: 'Present and format appears valid'
    });
    // Optional: Add a simple API test here
    // This would require importing the BirdeyeAPI class
}
function validateDataDirectory() {
    const dataDir = process.env.DATA_DIRECTORY || './data';
    // Check if directory exists
    if (!fs.existsSync(dataDir)) {
        try {
            fs.mkdirSync(dataDir, { recursive: true });
            results.push({
                name: 'Data Directory',
                status: 'success',
                message: `Created data directory: ${dataDir}`
            });
        }
        catch (err) {
            results.push({
                name: 'Data Directory',
                status: 'error',
                message: `Failed to create data directory: ${err instanceof Error ? err.message : String(err)}`
            });
        }
    }
    else {
        // Check if writeable
        try {
            const testFile = `${dataDir}/_test_${Date.now()}.tmp`;
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            results.push({
                name: 'Data Directory',
                status: 'success',
                message: `Directory exists and is writeable: ${dataDir}`
            });
        }
        catch (err) {
            results.push({
                name: 'Data Directory',
                status: 'error',
                message: `Directory exists but is not writeable: ${err instanceof Error ? err.message : String(err)}`
            });
        }
    }
}
function validateNumericConfigs() {
    const numericConfigs = [
        { name: 'MIN_LIQUIDITY', defaultValue: 5000, min: 1000 },
        { name: 'MAX_POSITION_SIZE', defaultValue: 50, min: 1 },
        { name: 'MAX_LIQUIDITY_PERCENTAGE', defaultValue: 5, min: 0.1, max: 10 },
        { name: 'SAVE_INTERVAL_MINUTES', defaultValue: 5, min: 1, max: 60 }
    ];
    numericConfigs.forEach(config => {
        const value = process.env[config.name];
        if (!value)
            return; // Optional, already handled
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            results.push({
                name: config.name,
                status: 'error',
                message: `Invalid numeric value: "${value}"`
            });
            return;
        }
        // Check minimum
        if (config.min !== undefined && numValue < config.min) {
            results.push({
                name: config.name,
                status: 'warning',
                message: `Value ${numValue} is below recommended minimum ${config.min}`
            });
            return;
        }
        // Check maximum
        if (config.max !== undefined && numValue > config.max) {
            results.push({
                name: config.name,
                status: 'warning',
                message: `Value ${numValue} is above recommended maximum ${config.max}`
            });
            return;
        }
        results.push({
            name: config.name,
            status: 'success',
            message: `Valid value: ${numValue}`
        });
    });
}
// Execute main function
main().catch(err => {
    console.error(`${colors.red}Error executing validation script:${colors.reset}`, err);
    process.exit(1);
});
//# sourceMappingURL=validate-config.js.map