// src/index.ts
import { runPaperTrading } from './paperTrading';
import logger from './utils/logger';
import config from './utils/config';

// Display startup information
logger.info('SolMemeBot Paper Trading System');
logger.info(`Configuration: Initial balance $${config.trading.initialBalance}`);
logger.info(`Max position size: $${config.trading.maxPositionSize}`);
logger.info(`Debug mode: ${config.debug.enabled ? 'Enabled' : 'Disabled'}`);

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
SolMemeBot - Paper Trading System

Usage:
  npm start             Run the paper trading system
  npm run dev           Run in development mode with ts-node
  npm test              Run all tests

Options:
  --help, -h            Show this help message
  --debug               Enable debug logging
  `);
  process.exit(0);
}

// Enable debug mode if specified
if (args.includes('--debug')) {
  logger.info('Debug mode enabled via command line');
  process.env.DEBUG = 'true';
}

// Handle interruptions gracefully
process.on('SIGINT', () => {
  logger.info('Received SIGINT. Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM. Shutting down...');
  process.exit(0);
});

// Run the paper trading system
logger.info('Starting paper trading system...');
runPaperTrading().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});