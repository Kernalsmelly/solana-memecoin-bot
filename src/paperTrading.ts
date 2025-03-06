// src/paperTrading.ts

import { config } from './utils/config';
import logger from './utils/logger';
import { TradingSystem } from './tradingSystem';

/**
 * Runs the paper trading module.
 */
export async function runPaperTrading(): Promise<void> {
  try {
    // Create a new TradingSystem instance using trading-related config.
    const tradingSystem = new TradingSystem({
      initialBalance: config.trading.initialBalance,
      maxPositionSize: config.trading.maxPositionSize,
      maxRisk: config.trading.maxRiskLevel,
      autoSave: config.trading.autoSave,
      dataDirectory: config.trading.dataDirectory,
      slippageTolerance: config.trading.slippageTolerance
    });

    // Initialize the trading system.
    await tradingSystem.initialize();
    logger.info("Paper trading system initialized.");

    // Define a dummy token mint (32-character string).
    const dummyTokenMint = "11111111111111111111111111111111";

    // Validate the token.
    const tokenRisk = await tradingSystem.validateToken(dummyTokenMint);
    logger.info(`Token ${dummyTokenMint} risk: ${tokenRisk.risk}`);

    // If the token's risk is acceptable, attempt to buy.
    if (tokenRisk.risk !== RiskLevel.CRITICAL) {
      const position = await tradingSystem.buyToken(dummyTokenMint, "DUMMY", 6, 500);
      logger.info(`Bought position: ${JSON.stringify(position)}`);
    } else {
      logger.warn(`Token ${dummyTokenMint} risk is CRITICAL. Trade aborted.`);
    }

    // Subscribe to token updates (if your system uses events for price updates).
    tradingSystem.subscribeToToken(dummyTokenMint);

    // Wait briefly (simulate time passing).
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the updated portfolio information.
    const portfolio = tradingSystem.getPortfolio();
    logger.info(`Updated portfolio: ${JSON.stringify(portfolio)}`);

    // Sell the token completely (100% of the position).
    const updatedPosition = await tradingSystem.sellToken(dummyTokenMint, 100);
    if (!updatedPosition) {
      logger.info(`Position for token ${dummyTokenMint} fully closed.`);
    } else {
      logger.info(`Updated position after sell: ${JSON.stringify(updatedPosition)}`);
    }

    // Save the trading state.
    await tradingSystem.saveState();
    logger.info("Trading state saved.");

    // Shutdown the trading system gracefully.
    await tradingSystem.shutdown();
    logger.info("Paper trading system shutdown complete.");
  } catch (error) {
    logger.error("Paper trading encountered an error:", error);
  }
}

// If this file is executed directly, run the paper trading module.
if (require.main === module) {
  runPaperTrading().catch(err => {
    logger.error("Fatal error during paper trading:", err);
    process.exit(1);
  });
}

export { runPaperTrading };
