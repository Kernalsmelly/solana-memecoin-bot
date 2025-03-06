"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const paperTrading_1 = require("./paperTrading");
const logger_1 = __importDefault(require("./utils/logger"));
const config_1 = __importDefault(require("./utils/config"));
// Display startup information
logger_1.default.info('SolMemeBot Paper Trading System');
logger_1.default.info(`Configuration: Initial balance $${config_1.default.trading.initialBalance}`);
logger_1.default.info(`Max position size: $${config_1.default.trading.maxPositionSize}`);
logger_1.default.info(`Debug mode: ${config_1.default.debug.enabled ? 'Enabled' : 'Disabled'}`);
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
    logger_1.default.info('Debug mode enabled via command line');
    process.env.DEBUG = 'true';
}
// Handle interruptions gracefully
process.on('SIGINT', () => {
    logger_1.default.info('Received SIGINT. Shutting down...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    logger_1.default.info('Received SIGTERM. Shutting down...');
    process.exit(0);
});
// Run the paper trading system
logger_1.default.info('Starting paper trading system...');
(0, paperTrading_1.runPaperTrading)().catch(err => {
    logger_1.default.error('Fatal error:', err);
    process.exit(1);
});
