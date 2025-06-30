"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const logger_1 = __importDefault(require("./logger"));
// dotenv.config(); // REMOVE THIS - Rely on index.ts loading
// Required environment variables for production
const REQUIRED_ENV_VARS = [
    'SOLANA_PRIVATE_KEY', // Standardized name
    'QUICKNODE_RPC_URL',
    'QUICKNODE_WSS_URL',
    'MAX_POSITION_SIZE',
    'MAX_ACTIVE_POSITIONS',
    'MAX_DAILY_LOSS_PERCENT',
    'MAX_DRAWDOWN_PERCENT',
    'VOLATILITY_THRESHOLD',
    'PRICE_DEVIATION_THRESHOLD',
    'MAX_TRADES_PER_MINUTE',
    'MAX_TRADES_PER_HOUR',
    'MAX_TRADES_PER_DAY',
    'MIN_SUCCESS_RATE'
];
// Recommended environment variables
const RECOMMENDED_ENV_VARS = [
    'DISCORD_WEBHOOK_URL',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID'
];
async function verifyConfig() {
    const result = {
        isValid: true,
        missingRequired: [],
        missingRecommended: [],
        walletStatus: { valid: false },
        rpcStatus: { valid: false },
        riskParameters: { valid: true, issues: [] }
    };
    // Check for required environment variables
    for (const envVar of REQUIRED_ENV_VARS) {
        if (!process.env[envVar]) {
            result.missingRequired.push(envVar);
            result.isValid = false;
        }
    }
    // Check for recommended environment variables
    for (const envVar of RECOMMENDED_ENV_VARS) {
        if (!process.env[envVar]) {
            result.missingRecommended.push(envVar);
        }
    }
    // Verify RPC connection
    try {
        const startTime = Date.now();
        const rpcUrl = process.env.QUICKNODE_RPC_URL;
        if (!rpcUrl) {
            throw new Error('QUICKNODE_RPC_URL is not defined in environment variables.');
        }
        const connection = new web3_js_1.Connection(rpcUrl, 'confirmed');
        await connection.getVersion(); // Use getVersion() to check connectivity
        const latency = Date.now() - startTime;
        result.rpcStatus = {
            valid: true, // If getVersion() didn't throw, connection is valid
            latency
        };
        if (latency > 2000) {
            logger_1.default.warn(`RPC latency is high: ${latency}ms`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error connecting to RPC';
        logger_1.default.error(`RPC connection check failed for ${process.env.QUICKNODE_RPC_URL}: ${errorMessage}`, {
            errorDetails: error instanceof Error ? error : JSON.stringify(error),
            cause: error instanceof Error && 'cause' in error ? error.cause : 'N/A',
            stack: error instanceof Error ? error.stack : 'N/A'
        });
        result.rpcStatus = {
            valid: false,
            error: errorMessage
        };
        result.isValid = false;
    }
    // Verify wallet
    try {
        if (process.env.SOLANA_PRIVATE_KEY) {
            const privateKey = bs58_1.default.decode(process.env.SOLANA_PRIVATE_KEY);
            const wallet = web3_js_1.Keypair.fromSecretKey(privateKey);
            const connection = new web3_js_1.Connection(process.env.QUICKNODE_RPC_URL || '', 'confirmed');
            // Check SOL balance
            const solBalance = await connection.getBalance(wallet.publicKey);
            result.walletStatus = {
                valid: true,
                address: wallet.publicKey.toString(),
                balance: solBalance / 1e9 // Convert lamports to SOL
            };
            if (solBalance < 0.1 * 1e9) {
                logger_1.default.warn('Wallet SOL balance is low. Consider funding for transaction fees.');
            }
        }
    }
    catch (error) {
        result.walletStatus = {
            valid: false,
            error: error instanceof Error ? error.message : 'Unknown error validating wallet'
        };
        result.isValid = false;
    }
    // Validate risk parameters
    try {
        const maxPositionSize = Number(process.env.MAX_POSITION_SIZE);
        const maxActivePositions = Number(process.env.MAX_ACTIVE_POSITIONS);
        const maxDailyLossPercent = Number(process.env.MAX_DAILY_LOSS_PERCENT);
        const maxDrawdownPercent = Number(process.env.MAX_DRAWDOWN_PERCENT);
        if (isNaN(maxPositionSize) || maxPositionSize <= 0) {
            result.riskParameters.issues.push('MAX_POSITION_SIZE must be a positive number');
            result.riskParameters.valid = false;
        }
        if (isNaN(maxActivePositions) || maxActivePositions <= 0 || !Number.isInteger(maxActivePositions)) {
            result.riskParameters.issues.push('MAX_ACTIVE_POSITIONS must be a positive integer');
            result.riskParameters.valid = false;
        }
        if (isNaN(maxDailyLossPercent) || maxDailyLossPercent <= 0 || maxDailyLossPercent > 100) {
            result.riskParameters.issues.push('MAX_DAILY_LOSS_PERCENT must be between 0 and 100');
            result.riskParameters.valid = false;
        }
        if (isNaN(maxDrawdownPercent) || maxDrawdownPercent <= 0 || maxDrawdownPercent > 100) {
            result.riskParameters.issues.push('MAX_DRAWDOWN_PERCENT must be between 0 and 100');
            result.riskParameters.valid = false;
        }
        if (!result.riskParameters.valid) {
            result.isValid = false;
        }
    }
    catch (error) {
        result.riskParameters.valid = false;
        result.riskParameters.issues.push(error instanceof Error ? error.message : 'Unknown error validating risk parameters');
        result.isValid = false;
    }
    if (!process.env.QUICKNODE_RPC_URL) {
        logger_1.default.warn('QUICKNODE_RPC_URL is not configured. RPC calls will fail.');
        result.isValid = false; // Make it invalid if missing
    }
    if (!process.env.QUICKNODE_WSS_URL) {
        logger_1.default.warn('QUICKNODE_WSS_URL is not configured. WebSocket detection will fail.');
        result.isValid = false; // Make it invalid if missing
    }
    return result;
}
exports.default = verifyConfig;
// Run when invoked directly
if (require.main === module) {
    (async () => {
        try {
            console.log('Verifying configuration...');
            const validationResult = await verifyConfig();
            if (validationResult.isValid) {
                console.log('✅ Configuration validated successfully');
            }
            else {
                console.log('❌ Configuration validation failed');
            }
            if (validationResult.missingRequired.length > 0) {
                console.log('Missing required environment variables:');
                console.log(validationResult.missingRequired.map(v => ` - ${v}`).join('\n'));
            }
            if (validationResult.missingRecommended.length > 0) {
                console.log('Missing recommended environment variables:');
                console.log(validationResult.missingRecommended.map(v => ` - ${v}`).join('\n'));
            }
            console.log('\nWallet Status:');
            if (validationResult.walletStatus.valid) {
                console.log(` - Address: ${validationResult.walletStatus.address}`);
                console.log(` - SOL Balance: ${validationResult.walletStatus.balance} SOL`);
            }
            else {
                console.log(` - Error: ${validationResult.walletStatus.error}`);
            }
            console.log('\nRPC Status:');
            if (validationResult.rpcStatus.valid) {
                console.log(` - Connected: Yes`);
                console.log(` - Latency: ${validationResult.rpcStatus.latency}ms`);
            }
            else {
                console.log(` - Error: ${validationResult.rpcStatus.error}`);
            }
            if (validationResult.riskParameters.issues.length > 0) {
                console.log('\nRisk Parameter Issues:');
                console.log(validationResult.riskParameters.issues.map(issue => ` - ${issue}`).join('\n'));
            }
            process.exit(validationResult.isValid ? 0 : 1);
        }
        catch (error) {
            console.error('Error during configuration verification:', error);
            process.exit(1);
        }
    })();
}
//# sourceMappingURL=verifyConfig.js.map