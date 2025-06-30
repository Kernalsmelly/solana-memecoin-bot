import { TokenDiscovery } from '../src/discovery/tokenDiscovery';
import { VolatilitySqueeze } from '../src/strategies/volatilitySqueeze';
import logger from '../src/utils/logger';
import { globalRateLimiter } from '../src/utils/rateLimiter';

async function main() {
  try {
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

    volatilitySqueeze.on('patternMatch', (match) => {
      logger.info(`Volatility Squeeze detected for ${match.token.address}`);
      logger.info(`Suggested position size: ${match.suggestedPosition} SOL`);
    });

    // Start components
    await discovery.start();
    volatilitySqueeze.start();

    // Run for 30 minutes
    logger.info('Starting dry-run simulation for 30 minutes...');
    await new Promise(resolve => setTimeout(resolve, 30 * 60 * 1000));

    // Clean up
    discovery.stop();
    volatilitySqueeze.stop();
    logger.info('Dry-run simulation completed');

  } catch (error) {
    logger.error('Error in dry-run simulation:', error);
    process.exit(1);
  }
}

main();
