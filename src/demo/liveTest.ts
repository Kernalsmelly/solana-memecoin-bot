import { LivePriceFeed } from '../utils/livePriceFeed';

interface PricePoint {
  price: number;
  volume: number;
  timestamp: number;
}

interface TokenState {
  address: string;
  symbol: string;
  priceHistory: PricePoint[];
  volumeHistory: number[];
  lastAlert: number;
  buyRatioHistory: number[];
}

const TOKENS_TO_MONITOR = [
  { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' },
  { address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', symbol: 'SAMO' },
  { address: '8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh', symbol: 'COPE' }
];

const HISTORY_LENGTH = 30; // 5 minutes of data (10s intervals)
const MIN_PRICE_CHANGE = 5; // 5% minimum price change
const MIN_VOLUME_SPIKE = 200; // 200% volume increase
const MIN_TIME_BETWEEN_ALERTS = 300000; // 5 minutes
const BUY_RATIO_THRESHOLD = 1.5; // 50% more buys than sells

const tokenStates = new Map<string, TokenState>();

function initializeTokenState(address: string, symbol: string): TokenState {
  return {
    address,
    symbol,
    priceHistory: [],
    volumeHistory: [],
    lastAlert: 0,
    buyRatioHistory: []
  };
}

function calculatePriceChange(priceHistory: PricePoint[]): number {
  if (priceHistory.length < 2) return 0;
  const oldPrice = priceHistory[0].price;
  const newPrice = priceHistory[priceHistory.length - 1].price;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

function calculateVolumeSpike(volumeHistory: number[]): number {
  if (volumeHistory.length < 2) return 0;
  const avgVolume = volumeHistory.slice(0, -1).reduce((a, b) => a + b, 0) / (volumeHistory.length - 1);
  const currentVolume = volumeHistory[volumeHistory.length - 1];
  return ((currentVolume - avgVolume) / avgVolume) * 100;
}

function calculateBuyRatio(buyRatioHistory: number[]): number {
  if (buyRatioHistory.length === 0) return 0;
  return buyRatioHistory[buyRatioHistory.length - 1];
}

function detectPump(state: TokenState): boolean {
  const priceChange = calculatePriceChange(state.priceHistory);
  const volumeSpike = calculateVolumeSpike(state.volumeHistory);
  const buyRatio = calculateBuyRatio(state.buyRatioHistory);
  const now = Date.now();

  // Check if enough time has passed since last alert
  if (now - state.lastAlert < MIN_TIME_BETWEEN_ALERTS) {
    return false;
  }

  // Log analysis data
  console.log(`\n[${state.symbol}] Analysis:`);
  console.log(`- Price Change: ${priceChange.toFixed(2)}%`);
  console.log(`- Volume Spike: ${volumeSpike.toFixed(2)}%`);
  console.log(`- Buy/Sell Ratio: ${buyRatio.toFixed(2)}`);

  // Detect pump patterns
  if (priceChange > MIN_PRICE_CHANGE && volumeSpike > MIN_VOLUME_SPIKE && buyRatio > BUY_RATIO_THRESHOLD) {
    state.lastAlert = now;
    return true;
  }

  return false;
}

async function monitorToken(address: string, symbol: string) {
  const feed = new LivePriceFeed(address);
  let state = tokenStates.get(address) || initializeTokenState(address, symbol);
  tokenStates.set(address, state);

  feed.on('price', (data: PricePoint & { buyRatio?: number }) => {
    // Update price history
    state.priceHistory.push(data);
    if (state.priceHistory.length > HISTORY_LENGTH) {
      state.priceHistory.shift();
    }

    // Update volume history
    state.volumeHistory.push(data.volume);
    if (state.volumeHistory.length > HISTORY_LENGTH) {
      state.volumeHistory.shift();
    }

    // Update buy ratio history if available
    if (data.buyRatio) {
      state.buyRatioHistory.push(data.buyRatio);
      if (state.buyRatioHistory.length > HISTORY_LENGTH) {
        state.buyRatioHistory.shift();
      }
    }

    // Check for pump
    if (detectPump(state)) {
      console.log('\n🚨 PUMP DETECTED! 🚨');
      console.log(`Token: ${state.symbol}`);
      console.log(`Current Price: $${data.price.toFixed(6)}`);
      console.log(`Volume: $${data.volume.toFixed(2)}`);
      console.log(`Buy/Sell Ratio: ${data.buyRatio?.toFixed(2) || 'N/A'}`);
      console.log('------------------------');
    }
  });

  feed.on('error', (error) => {
    console.error(`Error with ${symbol}:`, error.message);
  });

  await feed.start();
}

async function startLiveTest() {
  console.log('Live testing started! Monitoring tokens...');
  console.log('Press Ctrl+C to stop');

  await Promise.all(
    TOKENS_TO_MONITOR.map(token => monitorToken(token.address, token.symbol))
  );
}

startLiveTest().catch(console.error);
