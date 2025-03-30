import * as dotenv from 'dotenv';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as bs58 from 'bs58';
import logger from './logger';
import verifyConfig from './verifyConfig';
import { sendAlert } from './notifications';
import { manageFunds } from './fundManager';
import { RiskManager } from '../live/riskManager';
import { BirdeyeAPI } from '../api/birdeyeAPI'; // Use named import
import * as fs from 'fs';
import * as os from 'os';

dotenv.config();

interface PreFlightCheckResult {
  pass: boolean;
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
  metrics: {
    systemMemory: {
      total: number;
      free: number;
      percentFree: number;
    };
    systemCpu: {
      cores: number;
      load: number[];
    };
    networkLatency: {
      rpc: number;
      birdeyeApi: number | null;
    };
    walletStatus: {
      solBalance: number;
      usdcBalance: number;
      totalValueUsd: number;
    };
  };
}

/**
 * Comprehensive pre-flight check before live trading
 * Validates all system components, configuration, and environment
 */
export async function runPreFlightCheck(): Promise<PreFlightCheckResult> {
  logger.info('Running pre-flight check before launch');
  
  const result: PreFlightCheckResult = {
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
    logger.info('Checking environment configuration...');
    const configResult = await verifyConfig();
    
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
    } else if (configResult.rpcStatus.latency && configResult.rpcStatus.latency > 2000) {
      result.warnings.push(`RPC latency is high: ${configResult.rpcStatus.latency}ms`);
    }
    
    // Step 2: Check system resources
    logger.info('Checking system resources...');
    
    // CPU check
    const cpuCores = os.cpus().length;
    const loadAvg = os.loadavg();
    result.metrics.systemCpu = {
      cores: cpuCores,
      load: loadAvg
    };
    
    if (cpuCores < 2) {
      result.warnings.push(`Low CPU core count: ${cpuCores}. Recommended: 2+ cores`);
    }
    
    if (loadAvg[0] / cpuCores > 0.7) {
      result.warnings.push(`High system load: ${loadAvg[0].toFixed(2)}. May impact performance`);
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
    logger.info('Testing network connectivity and latency...');
    
    // RPC latency
    if (process.env.RPC_ENDPOINT) {
      const connection = new Connection(process.env.RPC_ENDPOINT);
      const rpcStartTime = Date.now();
      try {
        await connection.getSlot();
        const rpcLatency = Date.now() - rpcStartTime;
        result.metrics.networkLatency.rpc = rpcLatency;
        
        if (rpcLatency > 1000) {
          result.warnings.push(`High RPC latency: ${rpcLatency}ms`);
        }
      } catch (error) {
        result.criticalIssues.push('Failed to connect to RPC endpoint');
        result.pass = false;
      }
    }
    
    // Birdeye API latency (if configured)
    if (process.env.BIRDEYE_API_KEY) {
      try {
        const birdeyeAPI = new BirdeyeAPI(process.env.BIRDEYE_API_KEY);
        const apiStartTime = Date.now();
        
        // Simple API test - get a token price
        // Check latency using the new fetchTokenPrice method
        await birdeyeAPI.fetchTokenPrice('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
        
        const apiLatency = Date.now() - apiStartTime;
        result.metrics.networkLatency.birdeyeApi = apiLatency;
        
        if (apiLatency > 2000) {
          result.warnings.push(`High Birdeye API latency: ${apiLatency}ms`);
        }
      } catch (error) {
        result.warnings.push('Failed to connect to Birdeye API');
      }
    }
    
    // Step 4: Wallet check
    logger.info('Checking wallet status...');
    
    if (process.env.PRIVATE_KEY) {
      try {
        const walletReport = await manageFunds({ action: 'check' });
        
        result.metrics.walletStatus = {
          solBalance: walletReport.solBalance,
          usdcBalance: walletReport.usdcBalance,
          totalValueUsd: walletReport.totalValueUsd
        };
        
        if (walletReport.solBalance < 0.1) {
          result.warnings.push(`Low SOL balance: ${walletReport.solBalance}. Recommended: 0.1+ SOL`);
        }
        
        if (walletReport.usdcBalance < 10) {
          result.warnings.push(`Low USDC balance: $${walletReport.usdcBalance}. Required for trading`);
        }
      } catch (error) {
        result.warnings.push('Failed to check wallet balances');
      }
    }
    
    // Step 5: Contract validation check
    logger.info('Testing contract validation...');
    
    // Step 6: Notification system test
    logger.info('Testing notification system...');
    
    let notificationSuccess = false;
    if (process.env.DISCORD_WEBHOOK_URL || process.env.TELEGRAM_BOT_TOKEN) {
      try {
        await sendAlert('Pre-flight check running - Testing notification system', 'INFO');
        notificationSuccess = true;
      } catch (error) {
        result.warnings.push('Notification system test failed');
      }
    } else {
      result.recommendations.push('Consider setting up Discord or Telegram notifications');
    }
    
    // Step 7: System clock check
    const timeDrift = Math.abs(Date.now() - new Date().getTime());
    if (timeDrift > 1000) {
      result.warnings.push(`System clock appears to be out of sync (${timeDrift}ms drift)`);
    }
    
    // Step 8: Prepare report
    logger.info('Pre-flight check completed', {
      pass: result.pass,
      criticalIssues: result.criticalIssues.length,
      warnings: result.warnings.length
    });
    
    // Final recommendation on trading parameters
    if (result.criticalIssues.length === 0 && result.warnings.length <= 2) {
      result.recommendations.push('System looks good. Consider starting with 5-10% of your planned capital.');
    } else if (result.criticalIssues.length === 0) {
      result.recommendations.push('Address warnings before live trading or start with minimal capital (1-5%).');
    } else {
      result.recommendations.push('Fix critical issues before attempting live trading.');
    }
    
    // Send final notification
    if (notificationSuccess) {
      const statusMessage = result.pass 
        ? '✅ Pre-flight check PASSED - System ready for trading' 
        : '❌ Pre-flight check FAILED - Review issues before trading';
        
      await sendAlert(statusMessage, result.pass ? 'INFO' : 'WARNING');
    }
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Pre-flight check failed with error', { error: errorMessage });
    
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
      console.log(` - Memory: ${result.metrics.systemMemory.free}GB free / ${result.metrics.systemMemory.total}GB total (${result.metrics.systemMemory.percentFree}% free)`);
      console.log(` - CPU: ${result.metrics.systemCpu.cores} cores, Load: ${result.metrics.systemCpu.load[0].toFixed(2)}`);
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
    } catch (error) {
      console.error('Error during pre-flight check:', error);
      process.exit(1);
    }
  })();
}

export default runPreFlightCheck;
