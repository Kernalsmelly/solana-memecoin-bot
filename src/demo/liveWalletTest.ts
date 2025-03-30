import { LivePriceFeed } from '../utils/livePriceFeed';
import { EventEmitter } from 'events';
import axios from 'axios';
import { NewCoinDetector } from './newCoinDetector';

interface TokenData {
  address: string;
  symbol: string;
  name?: string;
  age?: number;
}

interface NewToken {
  address: string;
  symbol: string;
  name: string;
  createdAt: number;
  initialLiquidity: number;
}

interface Position {
  token: TokenData;
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  stopLoss: number;
  takeProfits: {
    level1: number;  // 15% gain
    level2: number;  // 25% gain
    level3: number;  // 50% gain
  };
  profitsTaken: {
    level1: boolean;
    level2: boolean;
    level3: boolean;
  };
  highestPrice: number;
  lastBuyRatio: number;
  volumeTrend: number;
}

interface WalletState {
  cash: number;
  positions: Map<string, Position>;
  totalValue: number;
  peakValue: number;
  trades: number;
  successfulTrades: number;
}

const TOKENS_TO_MONITOR: TokenData[] = [
  {
    address: "DezXAZ8z7PnrnRtS7pXjHMa3dukTFGQggnFFH3hJZgzQh",
    symbol: "BONK",
    name: "Bonk"
  },
  {
    address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    symbol: "SAMO",
    name: "Samoyedcoin"
  },
  {
    address: "8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh",
    symbol: "COPE",
    name: "Cope"
  }
];

const INITIAL_BALANCE = 100; // $100 USD
const TEST_DURATION = 30 * 60 * 1000; // 30 minutes
const UPDATE_INTERVAL = 60 * 1000; // Status update every minute

class LiveTradeSimulator extends EventEmitter {
  private wallet: WalletState;
  private priceHistory: Map<string, any[]>;
  private startTime: number;
  private statusInterval: NodeJS.Timeout | null;
  private newCoinDetector: NewCoinDetector;
  private maxPositions: number = 3;
  private maxPositionSize: number = 50; // Max $50 per position

  constructor() {
    super();
    this.wallet = {
      cash: INITIAL_BALANCE,
      positions: new Map(),
      totalValue: INITIAL_BALANCE,
      peakValue: INITIAL_BALANCE,
      trades: 0,
      successfulTrades: 0
    };
    this.priceHistory = new Map();
    this.startTime = Date.now();
    this.statusInterval = null;
    this.newCoinDetector = new NewCoinDetector();
  }

  async start() {
    console.log('🚀 Starting Live Trading Simulation');
    console.log('Initial Balance: $100');
    console.log('Duration: 30 minutes');
    console.log('==================\n');

    // Start new coin detector
    this.newCoinDetector.on('newToken', async (token) => {
      console.log(`\n💎 Evaluating New Token: ${token.symbol}`);
      
      // Add to monitoring list if it meets criteria
      if (this.shouldMonitorNewToken(token)) {
        console.log(`✅ Adding ${token.symbol} to monitoring list`);
        TOKENS_TO_MONITOR.push({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          age: Date.now() - token.createdAt
        });
        
        // Initialize price history
        this.priceHistory.set(token.address, []);
        
        // Initial price fetch
        try {
          const initialData = await this.fetchPriceData({
            address: token.address,
            symbol: token.symbol,
            name: token.name
          });
          this.handlePriceUpdate({
            address: token.address,
            symbol: token.symbol,
            name: token.name
          }, initialData);
        } catch (error: any) {
          console.error(`Error initializing ${token.symbol}:`, error?.message || 'Unknown error');
        }
      }
    });
    
    await this.newCoinDetector.startMonitoring(); // Correct method name
    
    // Initialize existing tokens
    for (const token of TOKENS_TO_MONITOR) {
      this.priceHistory.set(token.address, []);
      
      try {
        const initialData = await this.fetchPriceData(token);
        this.handlePriceUpdate(token, initialData);
        
        // Set up periodic updates
        setInterval(async () => {
          try {
            const data = await this.fetchPriceData(token);
            this.handlePriceUpdate(token, data);
          } catch (error: any) {
            console.error(`Error updating ${token.symbol}:`, error?.message || 'Unknown error');
          }
        }, 10000); // Update every 10 seconds
      } catch (error: any) {
        console.error(`Failed to initialize ${token.symbol}:`, error?.message || 'Unknown error');
      }

      // Add delay between token initializations
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Print initial status
    this.printStatus();

    // Status updates every minute
    this.statusInterval = setInterval(() => {
      this.printStatus();
    }, UPDATE_INTERVAL);

    // Run for 30 minutes
    setTimeout(() => this.stop(), TEST_DURATION);
  }

  private shouldMonitorNewToken(token: NewToken): boolean {
    // Only monitor tokens that are less than 12 hours old
    const ageHours = (Date.now() - token.createdAt) / (1000 * 60 * 60);
    if (ageHours > 12) return false;

    // Minimum $100k liquidity
    if (token.initialLiquidity < 100000) return false;

    // Don't monitor too many tokens
    if (TOKENS_TO_MONITOR.length >= 10) return false;

    return true;
  }

  private async fetchPriceData(token: TokenData): Promise<any> {
    const maxRetries = 3;
    const baseDelay = 2000;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Try Jupiter API first
        const jupiterResponse = await axios.get(`https://jup.ag/api/v4/price?ids=${token.address}&vsToken=USDC`, {
          timeout: 5000
        });

        if (jupiterResponse.data && jupiterResponse.data.data && jupiterResponse.data.data[0]) {
          const data = jupiterResponse.data.data[0];
          return {
            price: data.price,
            volume: data.volume24h || 0,
            buyRatio: 1.0, // Not available from Jupiter
            liquidity: data.liquidity || 0,
            priceChange: data.price_change_24h || 0
          };
        }

        // Fallback to Dexscreener
        const dexResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token.address}`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 5000
        });

        if (dexResponse.data && dexResponse.data.pairs && dexResponse.data.pairs[0]) {
          const pair = dexResponse.data.pairs[0];
          return {
            price: parseFloat(pair.priceUsd),
            volume: parseFloat(pair.volume.h24),
            buyRatio: pair.txns.h1Buy / (pair.txns.h1Buy + pair.txns.h1Sell),
            liquidity: parseFloat(pair.liquidity.usd),
            priceChange: parseFloat(pair.priceChange.h24)
          };
        }

        throw new Error('No valid data from APIs');

      } catch (error: any) {
        retryCount++;
        const delay = baseDelay * Math.pow(2, retryCount - 1); // Exponential backoff
        
        if (retryCount < maxRetries) {
          console.log(`Attempt ${retryCount} failed for ${token.symbol}: ${error?.message || 'Unknown error'}`);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw new Error(`Failed to fetch data after ${maxRetries} attempts`);
        }
      }
    }

    throw new Error('Failed to fetch data');
  }

  private handlePriceUpdate(token: TokenData, data: any) {
    const history = this.priceHistory.get(token.address)!;
    history.push(data);

    // Keep last 30 price points
    if (history.length > 30) history.shift();

    // Update position if we have one
    const position = this.wallet.positions.get(token.address);
    if (position) {
      this.updatePosition(position, data);
    } else if (this.shouldEnterPosition(token, history)) {
      this.enterPosition(token, data);
    }

    // Update total wallet value
    this.updateWalletValue();
  }

  private shouldEnterPosition(token: TokenData, history: any[]): boolean {
    if (history.length < 5) return false;
    if (this.wallet.cash < 10) return false; // Minimum $10 for new positions
    if (this.wallet.positions.size >= this.maxPositions) return false;

    const priceChange = this.calculatePriceChange(history);
    const volumeSpike = this.calculateVolumeSpike(history);
    const buyRatio = history[history.length - 1].buyRatio || 0;
    const momentum = this.calculateMomentum(history);

    const lastData = history[history.length - 1];
    const liquidity = lastData.liquidity || 0;
    const h24Change = lastData.priceChange || 0;

    // Special conditions for new tokens (less than 24h old)
    const isNewToken = token.age && token.age < 24 * 60 * 60 * 1000;
    
    console.log(`\nAnalyzing ${token.symbol}:`, {
      'Age': token.age ? `${(token.age / (1000 * 60 * 60)).toFixed(1)}h` : 'Unknown',
      'Price Change': `${priceChange.toFixed(2)}%`,
      'Volume Spike': `${volumeSpike.toFixed(2)}%`,
      'Buy/Sell Ratio': buyRatio.toFixed(2),
      'Momentum': `${momentum.toFixed(2)}%`,
      '24h Change': `${h24Change.toFixed(2)}%`,
      'Liquidity': `$${(liquidity / 1000000).toFixed(2)}M`
    });

    // More aggressive entry for new tokens
    if (isNewToken) {
      return (
        priceChange > 1 && // Lower threshold for new tokens
        volumeSpike > 50 && // Lower volume requirement
        buyRatio > 1.2 && // Lower buy ratio requirement
        momentum > 0 && // Still need positive momentum
        liquidity >= 50000 // Lower liquidity requirement
      );
    }

    // Standard entry conditions for established tokens
    return (
      priceChange > 2 && // >2% price increase
      volumeSpike > 100 && // >100% volume increase
      buyRatio > 1.3 && // More buyers than sellers
      momentum > 0 && // Positive momentum
      liquidity >= 100000 // At least $100k liquidity
    );
  }

  private enterPosition(token: TokenData, data: any) {
    const positionSize = Math.min(this.wallet.cash * 0.5, this.maxPositionSize); // Max 50% of cash or $50
    const quantity = positionSize / data.price;

    const position: Position = {
      token,
      entryPrice: data.price,
      quantity,
      currentPrice: data.price,
      stopLoss: data.price * 0.93, // 7% stop loss
      takeProfits: {
        level1: data.price * 1.15, // 15% gain
        level2: data.price * 1.25, // 25% gain
        level3: data.price * 1.50, // 50% gain
      },
      profitsTaken: {
        level1: false,
        level2: false,
        level3: false
      },
      highestPrice: data.price,
      lastBuyRatio: data.buyRatio || 0,
      volumeTrend: 0
    };

    this.wallet.positions.set(token.address, position);
    this.wallet.cash -= positionSize;
    this.wallet.trades++;

    console.log(`\n🔥 New Position: ${token.symbol}`);
    console.log(`Entry Price: $${data.price.toFixed(8)}`);
    console.log(`Position Size: $${positionSize.toFixed(2)}`);
    console.log(`Quantity: ${quantity.toFixed(2)}`);
  }

  private updatePosition(position: Position, data: any) {
    position.currentPrice = data.price;
    position.lastBuyRatio = data.buyRatio || 0;
    position.highestPrice = Math.max(position.highestPrice, data.price);

    // More aggressive trailing stop
    const trailingStop = position.highestPrice * 0.95; // Changed from 0.93 to 0.95
    if (trailingStop > position.stopLoss) {
      position.stopLoss = trailingStop;
    }

    // Check stop loss
    if (data.price <= position.stopLoss) {
      this.exitPosition(position, 'Stop Loss');
      return;
    }

    // Take profits based on momentum
    const currentValue = position.quantity * data.price;
    const momentum = this.calculateMomentum(this.priceHistory.get(position.token.address)!);

    // Adjusted profit-taking levels
    if (!position.profitsTaken.level1 && 
        data.price >= position.takeProfits.level1 && 
        momentum < 40) { // Increased from 35% to 40%
      const sellQuantity = position.quantity * 0.3;
      this.takeProfits(position, sellQuantity, 'Level 1');
      position.profitsTaken.level1 = true;
    }

    if (!position.profitsTaken.level2 && 
        data.price >= position.takeProfits.level2 && 
        momentum < 25) { // Increased from 20% to 25%
      const sellQuantity = position.quantity * 0.5;
      this.takeProfits(position, sellQuantity, 'Level 2');
      position.profitsTaken.level2 = true;
    }

    if (!position.profitsTaken.level3 && 
        data.price >= position.takeProfits.level3 && 
        momentum < 15) { // Increased from 10% to 15%
      const sellQuantity = position.quantity * 0.8;
      this.takeProfits(position, sellQuantity, 'Level 3');
      position.profitsTaken.level3 = true;
    }
  }

  private takeProfits(position: Position, sellQuantity: number, level: string) {
    const profitValue = sellQuantity * position.currentPrice;
    this.wallet.cash += profitValue;
    position.quantity -= sellQuantity;

    if (position.currentPrice > position.entryPrice) {
      this.wallet.successfulTrades++;
    }

    console.log(`\n💰 Taking Profits (${level}): ${position.token.symbol}`);
    console.log(`Sold: ${sellQuantity.toFixed(2)} tokens`);
    console.log(`Profit: $${(profitValue - (sellQuantity * position.entryPrice)).toFixed(2)}`);
    
    if (position.quantity < 0.01) {
      this.exitPosition(position, 'Position Closed');
    }
  }

  private exitPosition(position: Position, reason: string) {
    const exitValue = position.quantity * position.currentPrice;
    this.wallet.cash += exitValue;
    
    const entryValue = position.quantity * position.entryPrice;
    const profit = exitValue - entryValue;
    const profitPercent = (profit / entryValue) * 100;

    if (profit > 0) {
      this.wallet.successfulTrades++;
    }

    console.log(`\n📤 Position Exit (${reason}): ${position.token.symbol}`);
    console.log(`Exit Price: $${position.currentPrice.toFixed(8)}`);
    console.log(`Profit/Loss: ${profit > 0 ? '+' : ''}$${profit.toFixed(2)} (${profitPercent.toFixed(2)}%)`);

    this.wallet.positions.delete(position.token.address);
  }

  private updateWalletValue() {
    let positionsValue = 0;
    for (const position of this.wallet.positions.values()) {
      positionsValue += position.quantity * position.currentPrice;
    }

    this.wallet.totalValue = this.wallet.cash + positionsValue;
    this.wallet.peakValue = Math.max(this.wallet.peakValue, this.wallet.totalValue);
  }

  private calculatePriceChange(history: any[]): number {
    const oldPrice = history[0].price;
    const newPrice = history[history.length - 1].price;
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  private calculateVolumeSpike(history: any[]): number {
    const avgVolume = history.slice(0, -1).reduce((sum, point) => sum + point.volume, 0) / (history.length - 1);
    const currentVolume = history[history.length - 1].volume;
    return ((currentVolume - avgVolume) / avgVolume) * 100;
  }

  private calculateMomentum(history: any[]): number {
    const recentHistory = history.slice(-3); // Reduced from 5 to 3 for faster momentum detection
    if (recentHistory.length < 2) return 0;
    
    const oldPrice = recentHistory[0].price;
    const newPrice = recentHistory[recentHistory.length - 1].price;
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  private printStatus() {
    const elapsedMinutes = Math.floor((Date.now() - this.startTime) / 60000);
    const remainingMinutes = 30 - elapsedMinutes;
    const totalReturn = ((this.wallet.totalValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;

    console.log('\n📊 Portfolio Status');
    console.log(`Time: ${elapsedMinutes}min (${remainingMinutes}min remaining)`);
    console.log('==================');
    console.log(`Cash: $${this.wallet.cash.toFixed(2)}`);
    console.log(`Total Value: $${this.wallet.totalValue.toFixed(2)} (${totalReturn > 0 ? '+' : ''}${totalReturn.toFixed(2)}%)`);
    console.log(`Peak Value: $${this.wallet.peakValue.toFixed(2)}`);
    console.log(`Trades: ${this.wallet.trades}`);
    console.log(`Win Rate: ${this.wallet.trades > 0 ? ((this.wallet.successfulTrades / this.wallet.trades) * 100).toFixed(2) : 0}%`);

    // Active Positions
    if (this.wallet.positions.size > 0) {
      console.log('\nActive Positions:');
      for (const position of this.wallet.positions.values()) {
        const unrealizedPL = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
        console.log(`\n${position.token.symbol}:`);
        console.log(`- Current Price: $${position.currentPrice.toFixed(8)}`);
        console.log(`- Entry Price: $${position.entryPrice.toFixed(8)}`);
        console.log(`- Unrealized P/L: ${unrealizedPL > 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%`);
        console.log(`- Stop Loss: $${position.stopLoss.toFixed(8)}`);
        console.log(`- Position Size: ${position.quantity.toFixed(2)} tokens`);
      }
    }

    console.log('\n==================');
  }

  private stop() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }

    // Close all positions
    for (const position of this.wallet.positions.values()) {
      this.exitPosition(position, 'Test End');
    }

    // Print final results
    const totalReturn = ((this.wallet.totalValue - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
    const duration = Math.floor((Date.now() - this.startTime) / 60000);

    console.log('\n🏁 Final Results');
    console.log('==================');
    console.log(`Duration: ${duration} minutes`);
    console.log(`Initial Balance: $${INITIAL_BALANCE.toFixed(2)}`);
    console.log(`Final Balance: $${this.wallet.totalValue.toFixed(2)}`);
    console.log(`Total Return: ${totalReturn > 0 ? '+' : ''}${totalReturn.toFixed(2)}%`);
    console.log(`Peak Value: $${this.wallet.peakValue.toFixed(2)}`);
    console.log(`Total Trades: ${this.wallet.trades}`);
    console.log(`Successful Trades: ${this.wallet.successfulTrades}`);
    console.log(`Win Rate: ${this.wallet.trades > 0 ? ((this.wallet.successfulTrades / this.wallet.trades) * 100).toFixed(2) : 0}%`);
    console.log('==================\n');

    process.exit(0);
  }
}

// Start the simulation
new LiveTradeSimulator().start().catch((error: any) => console.error('Error starting simulation:', error?.message || 'Unknown error'));
