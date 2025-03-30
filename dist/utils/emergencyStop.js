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
exports.triggerEmergencyStop = triggerEmergencyStop;
const dotenv = __importStar(require("dotenv"));
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const bs58_1 = __importDefault(require("bs58"));
const logger_1 = __importDefault(require("./logger"));
const riskManager_1 = require("../live/riskManager");
const notifications_1 = require("./notifications");
dotenv.config();
/**
 * Trigger emergency stop for the trading bot
 * @param options Emergency stop options
 */
async function triggerEmergencyStop(options) {
    try {
        logger_1.default.warn('EMERGENCY STOP TRIGGERED', {
            reason: options.reason,
            timestamp: new Date().toISOString()
        });
        // Get wallet details from environment
        if (!process.env.PRIVATE_KEY || !process.env.RPC_ENDPOINT) {
            throw new Error('Missing required environment variables: PRIVATE_KEY, RPC_ENDPOINT');
        }
        const privateKey = bs58_1.default.decode(process.env.PRIVATE_KEY);
        const wallet = web3_js_1.Keypair.fromSecretKey(privateKey);
        const connection = new web3_js_1.Connection(process.env.RPC_ENDPOINT, 'confirmed');
        // Create or load risk manager
        const riskManager = new riskManager_1.RiskManager({
            maxPositionSize: Number(process.env.MAX_POSITION_SIZE || 50),
            maxPositions: Number(process.env.MAX_ACTIVE_POSITIONS || 3),
            maxDailyLoss: Number(process.env.MAX_DAILY_LOSS_PERCENT || 5),
            maxDrawdown: Number(process.env.MAX_DRAWDOWN_PERCENT || 10),
            maxVolatility: Number(process.env.VOLATILITY_THRESHOLD || 10),
            maxPriceDeviation: Number(process.env.PRICE_DEVIATION_THRESHOLD || 5),
            maxTradesPerMinute: Number(process.env.MAX_TRADES_PER_MINUTE || 5),
            maxTradesPerHour: Number(process.env.MAX_TRADES_PER_HOUR || 20),
            maxTradesPerDay: Number(process.env.MAX_TRADES_PER_DAY || 100),
            minSuccessRate: Number(process.env.MIN_SUCCESS_RATE || 80)
        });
        // Trigger emergency stop in the risk manager
        await riskManager.triggerEmergencyStop(options.reason);
        // Save emergency state if requested
        if (options.saveState) {
            const state = {
                timestamp: new Date().toISOString(),
                reason: options.reason,
                wallet: wallet.publicKey.toString(),
                metrics: riskManager.getMetrics()
            };
            const emergencyStateDir = './emergency-states';
            if (!fs.existsSync(emergencyStateDir)) {
                fs.mkdirSync(emergencyStateDir, { recursive: true });
            }
            fs.writeFileSync(`${emergencyStateDir}/emergency-state-${Date.now()}.json`, JSON.stringify(state, null, 2));
            logger_1.default.info('Emergency state saved');
        }
        // Send notifications if requested
        if (options.notifyContacts) {
            const alertMessage = `🚨 EMERGENCY STOP TRIGGERED 🚨\nReason: ${options.reason}\nTime: ${new Date().toISOString()}`;
            await (0, notifications_1.sendAlert)(alertMessage, 'CRITICAL');
            logger_1.default.info('Emergency notifications sent');
        }
        // Shutdown process if requested
        if (options.shutdownProcess) {
            logger_1.default.warn('Shutting down process due to emergency stop');
            process.exit(1);
        }
        return true;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Failed to trigger emergency stop:', errorMessage);
        console.error('Failed to trigger emergency stop:', errorMessage);
        // Try to send notification even if the main emergency stop failed
        try {
            await (0, notifications_1.sendAlert)(`❌ EMERGENCY STOP FAILED ❌\nError: ${errorMessage}`, 'CRITICAL');
        }
        catch (notifyError) {
            console.error('Failed to send emergency notification:', notifyError);
        }
        return false;
    }
}
// Run when invoked directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const shutdownProcess = args.includes('--shutdown');
    const saveState = args.includes('--save-state');
    const notifyContacts = args.includes('--notify');
    const reason = args.find(arg => arg.startsWith('--reason='))?.split('=')[1] || 'Manual emergency stop';
    (async () => {
        console.log('🚨 TRIGGERING EMERGENCY STOP 🚨');
        const success = await triggerEmergencyStop({
            reason,
            shutdownProcess,
            saveState,
            notifyContacts
        });
        if (success) {
            console.log('Emergency stop triggered successfully');
        }
        else {
            console.error('Failed to trigger emergency stop');
            process.exit(1);
        }
        if (!shutdownProcess) {
            process.exit(0);
        }
    })();
}
exports.default = triggerEmergencyStop;
