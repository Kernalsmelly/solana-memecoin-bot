"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tokenDiscovery_1 = require("../src/discovery/tokenDiscovery");
const volatilitySqueeze_1 = require("../src/strategies/volatilitySqueeze");
const logger_1 = __importDefault(require("../src/utils/logger"));
async function main() {
    try {
        // Initialize components with dry-run settings
        const discovery = new tokenDiscovery_1.TokenDiscovery({
            minLiquidity: 50000, // $50k minimum
            maxTokenAge: 24 * 60 * 60 * 1000, // 24 hours
            cleanupIntervalMs: 5 * 60 * 1000 // 5 minutes
        });
        const volatilitySqueeze = new volatilitySqueeze_1.VolatilitySqueeze({
            priceChangeThreshold: 20, // 20% price change
            volumeMultiplier: 2, // 2x 1h volume
            lookbackPeriodMs: 30 * 60 * 1000, // 30 minutes
            checkIntervalMs: 60 * 1000 // 1 minute
        });
        // Set up event listeners
        discovery.on('tokenDiscovered', async (token) => {
            logger_1.default.info(`New token discovered: ${token.address}`);
        });
        volatilitySqueeze.on('patternMatch', (match) => {
            logger_1.default.info(`Volatility Squeeze detected for ${match.token.address}`);
            logger_1.default.info(`Suggested position size: ${match.suggestedPosition} SOL`);
        });
        // Start components
        await discovery.start();
        volatilitySqueeze.start();
        // Run for 30 minutes
        logger_1.default.info('Starting dry-run simulation for 30 minutes...');
        await new Promise(resolve => setTimeout(resolve, 30 * 60 * 1000));
        // Clean up
        discovery.stop();
        volatilitySqueeze.stop();
        logger_1.default.info('Dry-run simulation completed');
    }
    catch (error) {
        logger_1.default.error('Error in dry-run simulation:', error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=dry-vol-sim.js.map