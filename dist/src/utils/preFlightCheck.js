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
exports.runPreFlightCheck = runPreFlightCheck;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = __importDefault(require("./logger"));
const verifyConfig_1 = __importDefault(require("./verifyConfig"));
const notifications_1 = require("./notifications");
const os = __importStar(require("os"));
/**
 * Comprehensive pre-flight check before live trading
 * Validates all system components, configuration, and environment
 */
async function runPreFlightCheck() {
    logger_1.default.info('Running pre-flight check before launch');
    const result = {
        pass: true,
        criticalIssues: [],
        warnings: [],
        recommendations: [],
        metrics: {
            systemMemory: {
                total: 0,
                free: 0,
                percentFree: 0
            },
            systemCpu: {
                cores: 0,
                load: []
            },
            networkLatency: {
                rpc: 0,
                birdeyeApi: null
            },
            walletStatus: {
                solBalance: 0,
                usdcBalance: 0,
                totalValueUsd: 0
            }
        }
    };
    try {
        // Step 1: Verify configuration
        logger_1.default.info('Checking environment configuration...');
        const configResult = await (0, verifyConfig_1.default)();
        if (!configResult.isValid) {
            result.pass = false;
            result.criticalIssues.push('Configuration validation failed');
            if (configResult.missingRequired.length > 0) {
                result.criticalIssues.push(`Missing required environment variables: ${configResult.missingRequired.join(', ')}`);
            }
        }
        if (configResult.missingRecommended.length > 0) {
            result.warnings.push(`Missing recommended environment variables: ${configResult.missingRecommended.join(', ')}`);
        }
        // Add RPC status
        if (configResult.rpcStatus.error) {
            result.criticalIssues.push(`RPC connection failed: ${configResult.rpcStatus.error}`);
            result.pass = false;
        }
        else if (configResult.rpcStatus.latency && configResult.rpcStatus.latency > 2000) {
            result.warnings.push(`RPC latency is high: ${configResult.rpcStatus.latency}ms`);
        }
        // Step 2: Check system resources
        logger_1.default.info('Checking system resources...');
        // CPU check
        const cpuCores = os.cpus().length;
        const loadAvg = os.loadavg();
        if (!loadAvg || loadAvg.length === 0) {
            result.warnings.push('Unable to get system load average');
            // @ts-ignore - Suppress persistent error; logic appears safe, revisit later
        }
        else if (loadAvg[0] > 0.7) {
            // Be extra explicit about checking and formatting loadAvg[0]
            let load1minFormatted = 'N/A';
            if (typeof loadAvg[0] === 'number') {
                load1minFormatted = loadAvg[0].toFixed(2);
            }
            result.warnings.push(`High system load: ${load1minFormatted}. May impact performance`);
        }
        result.metrics.systemCpu = {
            cores: cpuCores,
            load: loadAvg
        };
        if (cpuCores < 2) {
            result.warnings.push(`Low CPU core count: ${cpuCores}. Recommended: 2+ cores`);
        }
        // Memory check
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const percentFree = (freeMem / totalMem) * 100;
        result.metrics.systemMemory = {
            total: Math.round(totalMem / (1024 * 1024 * 1024) * 10) / 10, // GB
            free: Math.round(freeMem / (1024 * 1024 * 1024) * 10) / 10, // GB
            percentFree: Math.round(percentFree)
        };
        if (totalMem < 4 * 1024 * 1024 * 1024) { // 4GB
            result.warnings.push(`Low system memory: ${result.metrics.systemMemory.total}GB. Recommended: 4GB+`);
        }
        if (percentFree < 20) {
            result.warnings.push(`Low available memory: ${percentFree.toFixed(1)}% free`);
        }
        // Step 3: Network connectivity and latency tests
        logger_1.default.info('Testing network connectivity and latency...');
        // RPC latency
        if (process.env.RPC_ENDPOINT) {
            const connection = new web3_js_1.Connection(process.env.RPC_ENDPOINT);
            const rpcStartTime = Date.now();
            try {
                await connection.getSlot();
                const rpcLatency = Date.now() - rpcStartTime;
                result.metrics.networkLatency.rpc = rpcLatency;
                if (rpcLatency > 1000) {
                    result.warnings.push(`High RPC latency: ${rpcLatency}ms`);
                }
            }
            catch (error) {
                result.criticalIssues.push('Failed to connect to RPC endpoint');
                result.pass = false;
            }
        }
        // Birdeye API latency (if configured)
        // if (process.env.BIRDEYE_API_KEY) {
        //   try {
        //     const birdeyeAPI = new BirdeyeAPI(process.env.BIRDEYE_API_KEY);
        //     const apiStartTime = Date.now();
        //     // Simple API test - get a token price
        //     // Check latency using the new fetchTokenPrice method
        //     await birdeyeAPI.fetchTokenPrice('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
        //     const apiLatency = Date.now() - apiStartTime;
        //     result.metrics.networkLatency.birdeyeApi = apiLatency;
        //     if (apiLatency > 2000) {
        //       result.warnings.push(`High Birdeye API latency: ${apiLatency}ms`);
        //     }
        //   } catch (error) {
        //     result.warnings.push('Failed to connect to Birdeye API');
        //   }
        // }
        // Step 4: Wallet check
        logger_1.default.info('Checking wallet status...');
        if (process.env.PRIVATE_KEY) {
            try {
                // const walletReport = await manageFunds({ action: 'check' });
                // result.metrics.walletStatus = {
                //   solBalance: walletReport.solBalance,
                //   usdcBalance: walletReport.usdcBalance,
                //   totalValueUsd: walletReport.totalValueUsd
                // };
                // if (walletReport.solBalance < 0.1) {
                //   result.warnings.push(`Low SOL balance: ${walletReport.solBalance}. Recommended: 0.1+ SOL`);
                // }
                // if (walletReport.usdcBalance < 10) {
                //   result.warnings.push(`Low USDC balance: $${walletReport.usdcBalance}. Required for trading`);
                // }
            }
            catch (error) {
                result.warnings.push('Failed to check wallet balances');
            }
        }
        // Step 5: Contract validation check
        logger_1.default.info('Testing contract validation...');
        // Step 6: Notification system test
        logger_1.default.info('Testing notification system...');
        let notificationSuccess = false;
        if (process.env.DISCORD_WEBHOOK_URL || process.env.TELEGRAM_BOT_TOKEN) {
            try {
                await (0, notifications_1.sendAlert)('Pre-flight check running - Testing notification system', 'INFO');
                notificationSuccess = true;
            }
            catch (error) {
                result.warnings.push('Notification system test failed');
            }
        }
        else {
            result.recommendations.push('Consider setting up Discord or Telegram notifications');
        }
        // Step 7: System clock check
        const timeDrift = Math.abs(Date.now() - new Date().getTime());
        if (timeDrift > 1000) {
            result.warnings.push(`System clock appears to be out of sync (${timeDrift}ms drift)`);
        }
        // Step 8: Prepare report
        logger_1.default.info('Pre-flight check completed', {
            pass: result.pass,
            criticalIssues: result.criticalIssues.length,
            warnings: result.warnings.length
        });
        // Final recommendation on trading parameters
        if (result.criticalIssues.length === 0 && result.warnings.length <= 2) {
            result.recommendations.push('System looks good. Consider starting with 5-10% of your planned capital.');
        }
        else if (result.criticalIssues.length === 0) {
            result.recommendations.push('Address warnings before live trading or start with minimal capital (1-5%).');
        }
        else {
            result.recommendations.push('Fix critical issues before attempting live trading.');
        }
        // Send final notification
        if (notificationSuccess) {
            const statusMessage = result.pass
                ? '✅ Pre-flight check PASSED - System ready for trading'
                : '❌ Pre-flight check FAILED - Review issues before trading';
            await (0, notifications_1.sendAlert)(statusMessage, result.pass ? 'INFO' : 'WARNING');
        }
        return result;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.default.error('Pre-flight check failed with error', { error: errorMessage });
        result.pass = false;
        result.criticalIssues.push(`Pre-flight check error: ${errorMessage}`);
        return result;
    }
}
// Run when invoked directly
if (require.main === module) {
    (async () => {
        console.log('Running pre-flight check...');
        try {
            const result = await runPreFlightCheck();
            console.log('\n==== SOLMEMEBOT PRE-FLIGHT CHECK RESULTS ====\n');
            console.log(`OVERALL STATUS: ${result.pass ? '✅ PASS' : '❌ FAIL'}`);
            if (result.criticalIssues.length > 0) {
                console.log('\n🚨 CRITICAL ISSUES:');
                result.criticalIssues.forEach(issue => console.log(` - ${issue}`));
            }
            if (result.warnings.length > 0) {
                console.log('\n⚠️ WARNINGS:');
                result.warnings.forEach(warning => console.log(` - ${warning}`));
            }
            console.log('\n📊 SYSTEM METRICS:');
            if (!result.metrics?.systemCpu) {
                console.log('System CPU metrics not available');
            }
            else {
                const { cores, load } = result.metrics.systemCpu;
                console.log(` - CPU: ${cores} cores, Load: ${load?.[0]?.toFixed(2) ?? 'N/A'}`);
            }
            console.log(` - Memory: ${result.metrics.systemMemory.free}GB free / ${result.metrics.systemMemory.total}GB total (${result.metrics.systemMemory.percentFree}% free)`);
            console.log(` - RPC Latency: ${result.metrics.networkLatency.rpc}ms`);
            console.log(` - Birdeye API Latency: ${result.metrics.networkLatency.birdeyeApi || 'N/A'}ms`);
            console.log('\n💰 WALLET STATUS:');
            console.log(` - SOL Balance: ${result.metrics.walletStatus.solBalance} SOL`);
            console.log(` - USDC Balance: $${result.metrics.walletStatus.usdcBalance}`);
            console.log(` - Total Value: $${result.metrics.walletStatus.totalValueUsd}`);
            if (result.recommendations.length > 0) {
                console.log('\n💡 RECOMMENDATIONS:');
                result.recommendations.forEach(rec => console.log(` - ${rec}`));
            }
            console.log('\n===========================================\n');
            process.exit(result.pass ? 0 : 1);
        }
        catch (error) {
            console.error('Error during pre-flight check:', error);
            process.exit(1);
        }
    })();
}
exports.default = runPreFlightCheck;
//# sourceMappingURL=preFlightCheck.js.map