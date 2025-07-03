import 'dotenv/config';
import { TokenDiscovery } from '../src/discovery/tokenDiscovery';
import { VolatilitySqueeze } from '../src/strategies/volatilitySqueeze';
import logger from '../src/utils/logger';
import { globalRateLimiter } from '../src/utils/rateLimiter';

import { RiskManager } from '../src/live/riskManager';
import { NotificationManager } from '../src/live/notificationManager';
import minimist from 'minimist';
import ConnectionManager from '../src/connectionManager';
import { EnvVarSigner } from '../src/orderExecution/signer';
import { OrderManager } from '../src/orderExecution/orderManager';

async function main() {
  try {
    // Parse CLI flags
    const argv = minimist(process.argv.slice(2));
    const maxTrades = argv['max-trades'] ? Number(argv['max-trades']) : Infinity;
    const minutes = argv['minutes'] ? Number(argv['minutes']) : 30;
    const liveMode = process.env.LIVE_MODE === 'true';

    // Notification manager for alerts (dummy config for now)
    const notificationManager = new NotificationManager({ notifyLevel: 'all' });
    // Initialize components with dry-run settings
    const discovery = new TokenDiscovery({
      minLiquidity: 50000,  // $50k minimum
      maxTokenAge: 24 * 60 * 60 * 1000, // 24 hours
      cleanupIntervalMs: 5 * 60 * 1000  // 5 minutes
    });

    const volatilitySqueeze = new VolatilitySqueeze({
      priceChangeThreshold: 20,  // 20% price change
      volumeMultiplier: 2,       // 2x 1h volume
      lookbackPeriodMs: 30 * 60 * 1000, // 30 minutes
      checkIntervalMs: 60 * 1000  // 1 minute
    });

    // Set up event listeners
    discovery.on('tokenDiscovered', async (token) => {
      logger.info(`New token discovered: ${token.address}`);
    });

    const { fetchJupiterQuote } = await import('../src/orderExecution/jupiterQuote');
    const { handleDryRunFill } = await import('../src/orderExecution/dryRunFill');
    const fills: any[] = [];

    // Inject a real RiskManager for dry-run tracking
    const riskManager = new RiskManager({
      maxDrawdown: 0.2,
      maxDailyLoss: 0.1,
      maxPositions: 5,
      maxPositionSize: 10
    });

    let fillCount = 0;
    let killSwitchEngaged = false;

    // Live-mode: set up connection, signer, and order manager
    let connection, signer, orderManager;
    if (liveMode) {
      connection = await ConnectionManager.getInstance().getConnection();
      signer = new EnvVarSigner();
      orderManager = new OrderManager(connection, signer);
      orderManager.on('orderFilled', (order) => {
        logger.info(`[OrderConfirmedEvent] Signature: ${order.signature} Status: ${order.status}`);
        fills.push({
          ...order,
          confirmed: true,
        });
        fillCount++;
        // Risk manager update
        riskManager.recordTrade(0); // Replace 0 with actual PnL if available
        if (liveMode && fillCount >= maxTrades && !killSwitchEngaged) {
          notificationManager.notify('Test alert: Max trades reached in live-mode devnet.', 'all');
          logger.warn('🚨 Live-Mode kill-switch engaged');
          process.env.LIVE_MODE = 'false';
          killSwitchEngaged = true;
          printSummaryAndExit(fills, riskManager);
        }
      });
      orderManager.on('orderFailed', (order) => {
        logger.error(`[OrderFailedEvent] Signature: ${order.signature} Error: ${order.error}`);
      });
    }

    volatilitySqueeze.on('patternMatch', async (match) => {
      logger.info(`Volatility Squeeze detected for ${match.token.address}`);
      logger.info(`Suggested position size: ${match.suggestedPosition} SOL`);
      try {
        // Fetch Jupiter quote for token/SOL
        const inputMint = process.env.SIM_INPUT_MINT || 'So11111111111111111111111111111111111111112'; // SOL as default input
        const outputMint = match.token.address;

        if (liveMode) {
          // --- REAL JUPITER SWAP LOGIC (DEVNET) ---
          // 1. Fetch Jupiter quote
          const amount = Number(process.env.SIM_AMOUNT) || 1000000; // 0.001 SOL default (in lamports)
          const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
          const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
          if (!quote) {
            logger.warn('[JupiterQuote] No quote available for live swap');
            return;
          }
          logger.info('[JupiterQuote]', JSON.stringify(quote));

          // 2. Get swap transaction from Jupiter
          const swapTxBase64 = quote.tx;
          if (!swapTxBase64) {
            logger.error('[JupiterSwap] No swap transaction in quote');
            return;
          }
          const { VersionedTransaction } = await import('@solana/web3.js');
          const swapTxBuf = Buffer.from(swapTxBase64, 'base64');
          const transaction = VersionedTransaction.deserialize(swapTxBuf);

          // 3. Sign transaction with wallet
          transaction.sign([signer.keypair]);

          // 4. Send transaction
          const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
          logger.info(`[OrderSubmitted] Signature: ${signature}`);

          // 5. Register with OrderManager for confirmation tracking
          orderManager.placeOrder(transaction);
          // Confirmation and fillCount handled by orderManager event
          return;
        }
        const amount = Number(process.env.SIM_AMOUNT) || 1000000; // 0.001 SOL default (in lamports)
        const slippageBps = Number(process.env.SLIPPAGE_BPS) || 50;
        const quote = await fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps });
        if (quote) {
          logger.info('[JupiterQuote] Quote:', quote);
          logger.info('[JupiterQuote] Unsigned Tx:', quote.tx);
        } else {
          logger.warn('[JupiterQuote] No quote available');
        }
        // Simulate fill
        const action = 'buy';
        const fill = {
          action: action as 'buy' | 'sell',
          tokenAddress: outputMint,
          tokenSymbol: match.token.symbol,
          quantity: amount / 1e9, // assuming 9 decimals for SOL
          price: quote?.price || 0,
          meta: { patternMatch: match, quote }
        };
        await handleDryRunFill(fill, riskManager);
        fills.push(fill);
        fillCount++;

        // --- LIVE MODE KILL-SWITCH & ALERT ---
        if (liveMode && fillCount >= maxTrades && !killSwitchEngaged) {
          await notificationManager.notify('Test alert: Max trades reached in live-mode dry-run.', 'all');
          logger.warn('🚨 Live-Mode kill-switch engaged');
          // Flip kill switch
          process.env.LIVE_MODE = 'false';
          killSwitchEngaged = true;
          // Print summary and exit
          await printSummaryAndExit(fills, riskManager);
        }
      } catch (e) {
        logger.error('[DryRun] Error in simulated fill', e);
      }
    });

    // Start components
    await discovery.start();
    volatilitySqueeze.start();

    // Run for the specified number of minutes
    logger.info(`Starting dry-run simulation for ${minutes} minutes...`);
    await new Promise(resolve => setTimeout(resolve, minutes * 60 * 1000));

    // Clean up
    discovery.stop();
    volatilitySqueeze.stop();

    // PnL summary
    await printSummaryAndExit(fills, riskManager);

    logger.info('Dry-run simulation completed');

  } catch (error) {
    logger.error('Error in dry-run simulation:', error);
    process.exit(1);
  }
}

async function printSummaryAndExit(fills: any[], riskManager: any) {
  try {
    const { computePnLSummary } = await import('../src/utils/pnlStats');
    const summary = computePnLSummary(fills);
    const averagePnlPerTrade = fills.length ? summary.totalPnL / fills.length : 0;
    const summaryJson = {
      totalPnl: summary.totalPnL,
      maxDrawdown: summary.maxDrawdown,
      wins: summary.wins,
      losses: summary.losses,
      averagePnlPerTrade
    };
    logger.info('[PnL Summary]', JSON.stringify(summaryJson));
    process.exit(0);
  } catch (e) {
    logger.error('[PnL Summary] Error computing summary', e);
    process.exit(1);
  }
}

main();
