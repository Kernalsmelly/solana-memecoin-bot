import 'dotenv/config';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import ConnectionManager from '../src/connectionManager.js';
import { config } from '../src/utils/config.js';
import { Trader } from '../src/lib/Trader.js';
import { TradingEngine } from '../src/live/tradingEngine.js';
import { WhaleSignalWatcher } from '../src/utils/whaleSignalWatcher.js';
import { ForcedPumpManager } from '../src/utils/forcedPumpManager.js';
import { CongestionMonitor } from '../src/utils/congestionMonitor.js';
import { KeyRotationManager } from '../src/utils/keyRotationManager.js';
import { hasRecentNaturalVolume } from '../src/utils/naturalVolumeDetector.js';
import { walletKeypair } from '../src/utils/wallet.js';
import { NotificationManager } from '../src/live/notificationManager.js';
import { RiskManager } from '../src/live/riskManager.js';
import { checkForManualTrigger } from '../src/utils/manualTrigger.js'; // Manual trade trigger


// Safety: require explicit opt-in for live trading
if (
  !process.env.PATTERN_LIVE_TRADING_ENABLED ||
  process.env.PATTERN_LIVE_TRADING_ENABLED !== 'true'
) {
  console.error('PATTERN_LIVE_TRADING_ENABLED is not set to true. Exiting for safety.');
  process.exit(1);
}

(async () => {
  try {
    // Validate config and wallet
    if (!config || !config.trading || !config.solana) {
      console.error('[PatternLiveTrader] Invalid config. Exiting.');
      console.error(
        '[PatternLiveTrader] Troubleshooting: Check your .env file for missing or malformed variables.',
      );
      process.exit(1);
    }
    if (!walletKeypair) {
      console.error('[PatternLiveTrader] Wallet keypair not loaded. Exiting.');
      console.error(
        '[PatternLiveTrader] Troubleshooting: Ensure SOLANA_PRIVATE_KEY is set in your .env as a comma-separated number array.',
      );
      process.exit(1);
    }
    // Print config summary
    console.log('DEBUG: config.trading.dryRun =', config.trading.dryRun);
    console.log('DEBUG: config.trading.simulationMode =', config.trading.simulationMode);
    const dryRun = !!(config.trading.dryRun || config.trading.simulationMode);
    console.log('==============================');
    console.log('  🚀 Pattern Live Trader Start');
    console.log('------------------------------');
    console.log('Network:    ', config.solana.cluster);
    console.log('RPC:        ', config.solana.rpcEndpoint);
    console.log('Wallet:     ', walletKeypair.publicKey.toBase58());
    console.log('Dry Run:    ', dryRun ? 'ENABLED (NO LIVE TRADES)' : 'DISABLED (LIVE TRADING!)');
    console.log('Notifications:', config.notifications?.enabled ? 'ENABLED' : 'DISABLED');
    console.log('==============================');

    // --- Initialize notification manager ---
    const notifier = new NotificationManager({
      discord: config.notifications?.discordWebhookUrl
        ? {
            webhookUrl: config.notifications.discordWebhookUrl,
          }
        : undefined,
      telegram: config.notifications?.telegramBotToken
        ? {
            apiId: config.notifications.telegramApiId || 0,
            apiHash: config.notifications.telegramApiHash || '',
            sessionString: config.notifications.telegramSessionString || '',
            chatId: config.notifications.telegramChatId || '',
          }
        : undefined,
      notifyLevel: config.notifications?.notifyLevel || 'all',
    });

    // --- Secret Sauce: Multi-Key Rotation ---
    const keyArray = JSON.parse(process.env.SOLANA_PRIVATE_KEYS || '[]');
    const keypairs = keyArray.map((keyStr: string) => {
      const numbers = keyStr
        .replace(/\[|\]|"/g, '')
        .split(',')
        .map(Number);
      return Keypair.fromSecretKey(Uint8Array.from(numbers));
    });
    const keyRotationManager = new KeyRotationManager(
      keypairs,
      Number(process.env.KEY_ROTATION_TRADES || 3),
    );

    // --- Set up connection and trading engine ---
    const conn = ConnectionManager.getInstance().getConnectionSync();
    // FIX: Pass required arguments to TradingEngine constructor for mainnet/live trading
    const engine = new TradingEngine(
      conn,
      config,
      walletKeypair,
      keyRotationManager,
      notifier.notifyInfo?.bind(notifier) // Alert function
    );
    const trader = new Trader(conn, { patternOnly: true });

    // --- Initialize whale signal watcher ---
    const USDC_MINT = config.solana.usdcMint || process.env.USDC_MINT;
    const WHALE_SIGNAL_USDC = Number(process.env.WHALE_SIGNAL_USDC || 50000);
    const whaleWatcher = new WhaleSignalWatcher(conn, USDC_MINT ?? '', WHALE_SIGNAL_USDC ?? '');
    const pumpThresholds = new Map(); // mint -> { original, loweredUntil }
    whaleWatcher.on('whaleSignal', async (event) => {
      const { poolAddress, usdcAmount } = event;
      // Lower PUMP_THRESHOLD by 50% for 30s
      const orig = config.trading.pumpThreshold;
      pumpThresholds.set(poolAddress, { original: orig, loweredUntil: Date.now() + 30000 });
      if (typeof orig === 'number') config.trading.pumpThreshold = orig * 0.5;
      setTimeout(() => {
        if (typeof orig === 'number') config.trading.pumpThreshold = orig;
        pumpThresholds.delete(poolAddress);
      }, 30000);
      // Metric/alert
      if (notifier) {
        await notifier.notifyInfo(
          `[SECRET SAUCE] token=${poolAddress} event=whaleSignal usdcAmount=${usdcAmount}`,
        );
      }
      console.log(`[SECRET SAUCE] Whale signal: Lowered PUMP_THRESHOLD for ${poolAddress} for 30s`);
    });
    whaleWatcher.start();

    // --- Initialize forced pump manager ---
    const FORCED_PUMP_WAIT_SEC = Number(process.env.FORCED_PUMP_WAIT_SEC || 30);
    const FORCED_PUMP_SIZE = Number(process.env.FORCED_PUMP_SIZE || 0.0005);
    const forcedPumpManager = new ForcedPumpManager(conn, walletKeypair, {
      waitSec: FORCED_PUMP_WAIT_SEC,
      pumpSizeSol: FORCED_PUMP_SIZE,
    });

    // --- Initialize congestion monitor ---
    const CONGESTION_THRESHOLD_MS = Number(process.env.CONGESTION_THRESHOLD_MS || 800);
    const congestionMonitor = new CongestionMonitor(conn, CONGESTION_THRESHOLD_MS);
    const origPUMP_WINDOW_SEC = config.trading.pumpWindowSec;
    const origMAX_HOLD_SEC = config.trading.maxHoldSec;
    let congestionTimeout: NodeJS.Timeout | null = null;
    congestionMonitor.on('congestion', async (event) => {
      // Expand windows by 20% for 60s
      if (typeof origPUMP_WINDOW_SEC === 'number')
        config.trading.pumpWindowSec = Math.round(origPUMP_WINDOW_SEC * 1.2);
      if (typeof origMAX_HOLD_SEC === 'number')
        config.trading.maxHoldSec = Math.round(origMAX_HOLD_SEC * 1.2);
      if (notifier) {
        await notifier.notifyInfo(
          `[SECRET SAUCE] event=congestion blockTimeMs=${event.blockTimeMs} threshold=${event.threshold}`,
        );
      }
      console.log(`[SECRET SAUCE] Congestion detected: expanded pump/maxHold window for 60s`);
      if (congestionTimeout) clearTimeout(congestionTimeout);
      congestionTimeout = setTimeout(() => {
        if (typeof origPUMP_WINDOW_SEC === 'number')
          config.trading.pumpWindowSec = origPUMP_WINDOW_SEC;
        if (typeof origMAX_HOLD_SEC === 'number') config.trading.maxHoldSec = origMAX_HOLD_SEC;
        console.log(`[SECRET SAUCE] Congestion window reverted to normal.`);
      }, 60000);
    });
    congestionMonitor.start();

    // --- Main trading loop ---
    let tradeCount = 0;
    for await (const signal of trader.streamPatternSignals({ minutes: 1 })) {
      // Manual trigger check (before normal trade logic)
      let forcedPump = false;
      if (await checkForManualTrigger()) {
        forcedPump = true;
        console.log(`[ManualTrigger] Manual trade trigger detected. Forcing trade for ${signal.mint} at ${signal.price}`);
      }
      try {
        const logPrefix = `[PatternLiveTrader]`;
        console.log(
          `${logPrefix} Pattern signal detected for ${signal.mint} at price ${signal.price}`,
        );
        console.log(`${logPrefix} Dry Run: ${dryRun ? 'ENABLED' : 'DISABLED'}`);

        // Check for whale signals and adjust pump threshold
        const whaleSignal = pumpThresholds.get(signal.mint);
        if (whaleSignal) {
          console.log(
            `[SECRET SAUCE] Whale signal active for ${signal.mint} - lowering PUMP_THRESHOLD`,
          );
        }

        // Check for natural volume (mocked for pilot)
        const hasNaturalVolume = await hasRecentNaturalVolume(signal.mint);
        console.log(`[SECRET SAUCE] Natural volume check: ${hasNaturalVolume}`);

        // Execute trade
        let tradeResult: any;
        let tradeMsg: string;
        // forcedPump is set above if manual trigger detected
        try {
          console.log(`${logPrefix} Attempting to buy ${signal.mint} at ${signal.price}...`);
          const startTime = Date.now();
          tradeResult = await engine.buyToken(signal.mint, signal.price, {
            dryRun,
            forcedPump: forcedPump || !hasNaturalVolume,
          });
          const endTime = Date.now();
          console.log(`${logPrefix} BUY SUCCESS for ${signal.mint} at ${signal.price} (took ${endTime - startTime}ms)`);
          console.log(`${logPrefix} Trade details:`, tradeResult);
          if (tradeResult?.signature) {
            console.log(`${logPrefix} Waiting for transaction confirmation...`);
            const confirmation = await conn.confirmTransaction(tradeResult.signature);
            console.log(`${logPrefix} Transaction confirmed:`, confirmation);
            const position = await engine.getPositionSize(signal.mint);
            console.log(`${logPrefix} Current position size:`, position);
          }
          tradeMsg = `${logPrefix} BUY SUCCESS for ${signal.mint} at ${signal.price}`;
          console.log(tradeMsg);
        } catch (e) {
          tradeMsg = `${logPrefix} Error executing trade for ${signal.mint}: ${e}`;
          console.error(tradeMsg);
        }
        // Send notification if enabled
        if (config.notifications?.enabled && notifier) {
          try {
            await notifier.notifyTrade(tradeResult);
          } catch (notifyErr) {
            console.warn(`${logPrefix} Notification error:`, notifyErr);
          }
        }
      } catch (err) {
        console.error(`[PILOT LOOP ERROR]`, err);
      }
      tradeCount++;
    }
    console.log('==============================');
    console.log(`  ✅ Pattern Live Trader Completed. Trades attempted: ${tradeCount}`);
    console.log('==============================');
  } catch (outerErr) {
    console.error('[FATAL] Outer error:', outerErr);
  }
})();
