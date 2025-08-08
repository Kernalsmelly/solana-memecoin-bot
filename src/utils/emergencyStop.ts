import * as dotenv from 'dotenv';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import bs58 from 'bs58';
import logger from './logger.js';
import { LiveOrderExecution } from '../orderExecution.js';
import { JupiterDex } from '../dex/jupiterDex.js';
import { RiskManager, CircuitBreakerReason } from '../live/riskManager.js';
import { sendAlert } from './notifications.js';

dotenv.config();

interface EmergencyStopOptions {
  reason: string;
  shutdownProcess?: boolean;
  saveState?: boolean;
  notifyContacts?: boolean;
}

/**
 * Trigger emergency stop for the trading bot
 * @param options Emergency stop options
 */
export async function triggerEmergencyStop(options: EmergencyStopOptions): Promise<boolean> {
  try {
    logger.warn('EMERGENCY STOP TRIGGERED', {
      reason: options.reason,
      timestamp: new Date().toISOString(),
    });

    // Get wallet details from environment
    if (!process.env.PRIVATE_KEY || !process.env.RPC_ENDPOINT) {
      throw new Error('Missing required environment variables: PRIVATE_KEY, RPC_ENDPOINT');
    }

    const privateKey = bs58.decode(process.env.PRIVATE_KEY);
    const wallet = Keypair.fromSecretKey(privateKey);
    const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed');

    // Create or load risk manager
    const riskManager = new RiskManager({
      // Ensure properties match RiskManagerConfig
      maxPositionSize: Number(process.env.MAX_POSITION_SIZE || 50),
      maxPositions: Number(process.env.MAX_ACTIVE_POSITIONS || 3),
      maxDailyLoss: Number(process.env.MAX_DAILY_LOSS_PERCENT || 5),
      maxDrawdown: Number(process.env.MAX_DRAWDOWN_PERCENT || 10),
      maxVolatility: Number(process.env.VOLATILITY_THRESHOLD || 10),
      maxPriceDeviation: Number(process.env.PRICE_DEVIATION_THRESHOLD || 5),
      maxTradesPerMinute: Number(process.env.MAX_TRADES_PER_MINUTE || 5),
      maxTradesPerHour: Number(process.env.MAX_TRADES_PER_HOUR || 20),
      maxTradesPerDay: Number(process.env.MAX_TRADES_PER_DAY || 100),
      minSuccessRate: Number(process.env.MIN_SUCCESS_RATE || 80),
    });

    // Trigger emergency stop in the risk manager
    await riskManager.triggerEmergencyStop(options.reason);

    // Save emergency state if requested
    if (options.saveState) {
      const state = {
        timestamp: new Date().toISOString(),
        reason: options.reason,
        wallet: wallet.publicKey.toString(),
        metrics: riskManager.getMetrics(),
      };

      const emergencyStateDir = './emergency-states';
      if (!fs.existsSync(emergencyStateDir)) {
        fs.mkdirSync(emergencyStateDir, { recursive: true });
      }

      fs.writeFileSync(
        `${emergencyStateDir}/emergency-state-${Date.now()}.json`,
        JSON.stringify(state, null, 2),
      );

      logger.info('Emergency state saved');
    }

    // Send notifications if requested
    if (options.notifyContacts) {
      const alertMessage = `🚨 EMERGENCY STOP TRIGGERED 🚨\nReason: ${options.reason}\nTime: ${new Date().toISOString()}`;
      await sendAlert(alertMessage, 'CRITICAL');
      logger.info('Emergency notifications sent');
    }

    // Shutdown process if requested
    if (options.shutdownProcess) {
      logger.warn('Shutting down process due to emergency stop');
      process.exit(1);
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to trigger emergency stop:', errorMessage);
    console.error('Failed to trigger emergency stop:', errorMessage);

    // Try to send notification even if the main emergency stop failed
    try {
      await sendAlert(`❌ EMERGENCY STOP FAILED ❌\nError: ${errorMessage}`, 'CRITICAL');
    } catch (notifyError) {
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
  const reason =
    args.find((arg) => arg.startsWith('--reason='))?.split('=')[1] || 'Manual emergency stop';

  (async () => {
    console.log('🚨 TRIGGERING EMERGENCY STOP 🚨');
    const success = await triggerEmergencyStop({
      reason,
      shutdownProcess,
      saveState,
      notifyContacts,
    });

    if (success) {
      console.log('Emergency stop triggered successfully');
    } else {
      console.error('Failed to trigger emergency stop');
      process.exit(1);
    }

    if (!shutdownProcess) {
      process.exit(0);
    }
  })();
}

export default triggerEmergencyStop;
