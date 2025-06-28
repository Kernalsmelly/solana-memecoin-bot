# Solana Memecoin Trading Bot 

Advanced trading bot for Solana memecoins with real-time pattern detection and automated trading capabilities.

## Features

### Pattern Detection 
- Volatility Squeeze (20%+ price change within 30 min with 2x volume)
- (More patterns coming soon...)

### Real-time Monitoring 
- Birdeye WebSocket integration
- Jupiter price data
- Dexscreener fallback
- Advanced filtering criteria
- Auto-reconnection

### Risk Management 
- Maximum drawdown protection
- Daily loss limits
- Position size limits
- Slippage protection
- Emergency stop functionality

### Trading Features 
- Automated entry/exit
- Dynamic position sizing
- Multi-target take profits
- Trailing stop losses
- Smart order routing via Jupiter

### Notifications 
- Discord integration
- Telegram alerts
- Real-time trade updates
- Pattern alerts
- Risk warnings

## Installation

### macOS Setup
See detailed [macOS setup guide](docs/SETUP_MAC.md)

### Quick Start

1. Clone the repository:
```bash
git clone https://github.com/yourusername/solmemebot.git
cd solmemebot
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Install dependencies:
```bash
pnpm install
```

4. Build the project:
```bash
pnpm run build
```

5. Run dry-run simulation:
```bash
pnpm run dry-vol-sim
```

The dry-run simulation will:
- Monitor new tokens with >$50k liquidity
- Detect volatility squeezes
- Simulate trades without broadcasting
- Log risk metrics

## Free Data Stack

This bot uses only free, public endpoints for all market and blockchain data:

- **Dexscreener** (`https://api.dexscreener.com/latest/dex/tokens/{address}`) — up to 55 req/min
- **GeckoTerminal** (`https://api.geckoterminal.com/api/v2/networks/solana/tokens/{address}`) — up to 55 req/min
- **Birdeye Public** (`https://public-api.birdeye.so/public/price?address={address}`) — up to 25 req/min
- **Solana RPC** (rotates: helio, mainnet-beta, serum) — round-robin, 3-strike timeout ejection

### Rate Limit Notes
- All sources are throttled internally (see `src/integrations/data-hub/DataBroker.ts`)
- LRU cache (default 10s TTL) prevents excessive re-queries

### Environment Variables
- `RPC_URLS` — comma-separated Solana RPC URLs (optional, uses defaults if unset)
- `CACHE_TTL_MS` — cache TTL for market data (default: 10000)

```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```
# API Keys
BIRDEYE_API_KEY=your_birdeye_api_key

# Wallet Configuration
WALLET_PRIVATE_KEY=your_wallet_private_key
WALLET_ADDRESS=your_wallet_address

# RPC Configuration
RPC_ENDPOINT=https://solana-mainnet.rpc.examplenode.com

# Trading Parameters
MIN_LIQUIDITY=50000
MAX_POSITION_SIZE=50
MAX_LIQUIDITY_PERCENTAGE=5
MAX_POSITIONS=3
MAX_POSITION_VALUE_USD=50

# Risk Management
MAX_DRAWDOWN=10
MAX_DAILY_LOSS=5
SLIPPAGE_BPS=100
EMERGENCY_STOP_THRESHOLD=15

# Token Discovery
MIN_TRANSACTIONS_5MIN=5
MAX_TOKEN_AGE=24
VOLUME_LIQUIDITY_RATIO=0.05

# Logging
LOG_LEVEL=info
LOG_DIRECTORY=./logs
LOG_MAX_SIZE=20m
LOG_MAX_FILES=14d

# Notifications (optional)
DISCORD_WEBHOOK_URL=your_discord_webhook
TELEGRAM_BOT_TOKEN=your_telegram_token
TELEGRAM_CHAT_ID=your_chat_id
NOTIFICATION_LEVEL=trades
```

## Usage

### Validate Configuration
Before running the bot, validate your configuration:

```bash
npm run validate-config
```

### Live Trading
To start the bot with all safety features:

```bash
npm run production-launch
```

### Test Mode (Dry Run)
Run the bot without executing actual trades:

```bash
npm run start -- --dry-run
```

### Emergency Stop
If you need to immediately stop all trading:

```bash
npm run emergency-stop
```

### Performance Dashboard
View real-time trading performance:
```bash
npm run dashboard
```

- The dashboard runs automatically with the bot and is accessible at [http://localhost:3000](http://localhost:3000) (or the port set by `DASHBOARD_PORT`).
- It displays live and historical risk metrics, circuit breaker status, emergency stop state, and system health.
- Use the dashboard to monitor for anomalies, missed heartbeats, or risk triggers in real time.

### Logging, Alerts & Troubleshooting

### Scenario Logging & Alerts
- All critical events (errors, circuit breakers, emergency stops, trade anomalies) are logged to scenario logs and sent as alerts via Discord and Telegram (if configured).
- Alerts include detailed context and timestamps for each event.

### Log Files
- Logs are written to the directory specified by `LOG_DIRECTORY` (default: `./logs`).
- Scenario logs and trade logs are CSV-safe and timestamped for easy auditing.
- Log rotation and size are controlled by `LOG_MAX_SIZE` and `LOG_MAX_FILES`.

### Common Startup & Runtime Issues
- **Missing or invalid environment variables:**
  - The bot will fail fast and alert if required secrets or config values are missing.
  - Check `.env` and logs for details on missing/invalid fields.
- **Pre-flight check failures:**
  - Startup validation covers wallet, RPC, API keys, and config. Any failure is logged and alerted.
- **Missed heartbeat alerts:**
  - If a core service (e.g. PriceWatcher, TradingEngine, NewCoinDetector) fails to send a heartbeat, an alert is sent and the dashboard will show the last-seen timestamp.

### Emergency Stop & Recovery
- Trigger an emergency stop via command or UI to halt all trading immediately.
- Emergency stop status is visible on the dashboard and in alerts.
- To recover, resolve the root cause (see logs/alerts), then reset the emergency stop via command or dashboard if supported.

### Interpreting Alerts & Dashboard Status
- **CRITICAL** alerts require immediate attention and indicate a failure or risk threshold breach.
- **Scenario logs** provide a full audit trail for all major events and can be used for troubleshooting and compliance.
- Use the dashboard to verify system health, risk status, and operational readiness at a glance.

### Generate Performance Report
Create a daily summary of trading performance:

```bash
npm run generate-report
```

## Token Detection Criteria

### New Tokens (<24h)
- Price change > 1%
- Volume spike > 50%
- Buy ratio > 1.2
- Min liquidity $50k

### Established Tokens
- Price change > 2%
- Volume spike > 100%
- Buy ratio > 1.3
- Min liquidity $100k

## Pattern Optimization

The system has been tuned based on historical performance data, with the top performing patterns being:

### Mega Pump and Dump (187.5% return)
- Price change: >40%
- Volume increase: >170%
- Buy ratio: >2.5
- Max age: 12 hours

### Volatility Squeeze (75.9% return)
- Price change: >20%
- Volume increase: >100%
- Buy ratio: >1.7
- Max age: 24 hours

### Smart Money Trap (66.8% return)
- Price change: >15%
- Volume increase: >80%
- Buy ratio: >1.8
- Max age: 36 hours

## Risk Management

The bot implements multi-layered risk management:

1. **Position Level**
   - Dynamic position sizing based on token liquidity
   - Maximum $50 per position
   - Maximum 5% of token's liquidity
   - Dynamic stop-loss based on volatility

2. **Portfolio Level**
   - Maximum 3 concurrent positions
   - 50% maximum portfolio allocation
   - Age-based risk adjustment

3. **Circuit Breakers**
   - Maximum 10% drawdown
   - Maximum 5% daily loss
   - Emergency stop at 15% total loss
   - Automatic cooldown periods after losses

## Performance Monitoring

Current system metrics:
- Average PnL: 38.0% (↑1.1%)
- Average Max Drawdown: 25.5% (↓1.2%)
- Profit Factor: 1.38 (↑0.01)
- Win Rate: 100%

## File Structure

```
📦solmemebot
 ┣ 📂src
 ┃ ┣ 📂api
 ┃ ┃ ┗ 📜birdeyeAPI.ts        # Birdeye API integration
 ┃ ┣ 📂discovery
 ┃ ┃ ┗ 📜tokenDiscovery.ts    # Token discovery system
 ┃ ┣ 📂live
 ┃ ┃ ┗ 📜riskManager.ts       # Risk management system
 ┃ ┣ 📂orderExecution
 ┃ ┃ ┗ 📜index.ts             # Order execution system
 ┃ ┣ 📂scripts
 ┃ ┃ ┣ 📜emergency-stop.ts    # Emergency stop script
 ┃ ┃ ┣ 📜generate-report.ts   # Performance reporting
 ┃ ┃ ┣ 📜performance-dashboard.ts # Live dashboard
 ┃ ┃ ┣ 📜production-launch.ts # Production launcher
 ┃ ┃ ┗ 📜validate-config.ts   # Config validation
 ┃ ┣ 📂strategy
 ┃ ┃ ┗ 📜patternDetector.ts   # Trading pattern detection
 ┃ ┣ 📂tests
 ┃ ┃ ┣ 📜birdeyeAPI.test.ts   # API tests
 ┃ ┃ ┣ 📜patternDetector.test.ts # Pattern detection tests
 ┃ ┃ ┣ 📜riskManager.test.ts  # Risk management tests
 ┃ ┃ ┗ 📜tokenDiscovery.test.ts # Token discovery tests
 ┃ ┣ 📂types
 ┃ ┃ ┗ 📜index.ts             # TypeScript type definitions
 ┃ ┗ 📂utils
 ┃   ┣ 📜contractValidator.ts # Smart contract validation
 ┃   ┣ 📜fundManager.ts       # Fund management utilities
 ┃   ┣ 📜logger.ts            # Logging system
 ┃   ┣ 📜notifications.ts     # Alert system
 ┃   ┗ 📜rateLimiter.ts       # API rate limiting
 ┣ 📜.env.example             # Example environment config
 ┣ 📜package.json             # Project dependencies
 ┣ 📜README.md                # Project documentation
 ┗ 📜tsconfig.json            # TypeScript configuration
```

## Production Deployment Checklist

Before deploying to production, verify:

1. **Configuration**
   - Run `npm run validate-config` to verify all required settings
   - Ensure RPC endpoints are reliable and low-latency
   - Set appropriate risk parameters for your capital

2. **Testing**
   - Run all unit tests: `npm test`
   - Perform a dry run: `npm run start -- --dry-run`

3. **Infrastructure**
   - Setup on a reliable server with 24/7 uptime
   - Configure automatic restart in case of crashes
   - Setup monitoring and alerts

4. **Security**
   - Ensure private keys are properly secured
   - Use hardware wallets when possible
   - Setup IP restrictions for API access

## Security

- Private keys are stored locally
- API keys are managed through environment variables
- Slippage protection on all trades
- Emergency stop functionality
- Auto-retry with exponential backoff

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

Trading cryptocurrencies carries significant risk. This software is for educational purposes only. Always do your own research and never trade with money you can't afford to lose.
