import { tradeSimulator } from '../src/tradeSimulator';
import { mockPriceFeed } from '../src/utils/mockPriceFeed';

async function main() {
  // Use a token present in the mock price database
  const tokenAddress = 'SOL123';
  const usdAmount = 50; // Simulate a $50 trade

  // Explicitly set a price for the token to ensure the price feed works
  mockPriceFeed.updatePrice(tokenAddress, 0.000025, 1000); // Set a mock price (in USD) and a default volume

  console.log('\n===== SIMULATED TRADE TEST =====');
  // Simulate a BUY
  const buyResult = await tradeSimulator.executeTrade(tokenAddress, usdAmount, 'BUY');
  if (buyResult) {
    console.log(`Simulated BUY: ${usdAmount} USD of token ${tokenAddress}`);
  } else {
    console.error('Simulated BUY failed.');
    return;
  }

  // Simulate a SELL
  const sellResult = await tradeSimulator.executeTrade(tokenAddress, usdAmount, 'SELL');
  if (sellResult) {
    console.log(`Simulated SELL: ${usdAmount} USD of token ${tokenAddress}`);
  } else {
    console.error('Simulated SELL failed.');
    return;
  }

  console.log('Trade simulation complete. Check logs or dashboard for P/L and position updates.');
  console.log('=================================\n');
}

main();
