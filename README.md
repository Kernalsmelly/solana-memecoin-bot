# Solana Memecoin Trading Bot

Advanced trading bot for Solana memecoins with real-time pattern detection and automated trading capabilities.

---

## 🚀 Production Quickstart

### 1. Build and Run with Docker

```sh
# Build the production image
LIVE_MODE=false docker build -t solana-memecoin-bot .
# Run the bot (dry-run)
docker run --env-file .env -p 3000:3000 solana-memecoin-bot
```

### 2. Mainnet Live Trading

```sh
LIVE_MODE=true NETWORK=mainnet docker run --env-file .env -p 3000:3000 solana-memecoin-bot
```

### 3. Hardware Wallet (Ledger) [Production]

- Set `SIGNER_TYPE=ledger` in your `.env`.
- Connect Ledger and unlock Solana app before starting.
- (See `src/orderExecution/signer.ts` for implementation status.)

### 4. Dashboard & Health

- Visit `http://localhost:3000` for real-time dashboard.
- Prometheus metrics: `http://localhost:3000/metrics`
- Healthcheck: `http://localhost:3000/health`

### 5. Parameter Sweep

```sh
pnpm tsx scripts/backtest-vol-sim.ts --sweep
# Results in sweep-report.json
```

---

## Features

### Multi-Pair & Treasury (v2.6.0)

### Profit Tuning (v2.5.2)

#### Grid-Optimized Parameters

- **STOP_LOSS_PCT:** 1
- **TAKE_PROFIT_PCT:** 1
- **RISK_PCT:** 0.002
- Selected by grid search over the last 50 trades for best win rate and net PnL.

#### Dynamic Sizing Formula

- Trade size is dynamically set as:
  ```ts
  sizeSOL = Math.min(maxExposureSol, (balance * riskPct) / σ30m);
  ```
- See `__tests__/dynamicSizing.test.ts` for verification.

#### Provider Resilience

- Pluggable provider chain: free RPC → paid RPC → fallback.
- On provider failure, the bot logs a switch and continues trading without data gaps.
- Example logs:
  ```
  [ProviderSwitch] Switching to backup provider: QUICKNODE_RPC_URL
  [ProviderSwitch] Switching to fallback provider: HELIUS_RPC_URL
  [ParameterUpdateEvent] { "STOP_LOSS_PCT":1, "TAKE_PROFIT_PCT":1, "RISK_PCT":0.002 }
  ```

#### Cost Modeling & Alerts

- PnL calculations subtract on-chain fees and slippage (see `__tests__/pnlCostModel.test.ts`).
- Alerts fire after ≥3 consecutive losses (`__tests__/consecutiveLossAlert.test.ts`).

#### Release

- This tuning is released as **v2.5.2**.

#### USDC Base Currency Support

- The bot can now trade with either SOL or USDC as the base currency.
- Set `BASE_CURRENCY=SOL` (default) or `BASE_CURRENCY=USDC` in your `.env`.
- For USDC, also set `USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (mainnet USDC mint).
- All quoting, swap, and order logic will use the configured base for input mints.

#### Automatic Profit Conversion to USDC Treasury

- When `BASE_CURRENCY=USDC`, any profitable SOL trade will automatically swap proceeds to USDC using Jupiter.
- Net USDC from the swap is recorded in a persistent treasury at `data/treasury.json`.
- Example log:
  ```
  [TreasurySwap] from SOL to USDC: amount=0.42, netUSDC=17.21
  ```
- All treasury updates are atomic and logged for auditability.

#### Treasury File

- The cumulative USDC treasury is stored in `data/treasury.json`.
- Use `getTreasuryBalance()` and `recordProfit()` in code to access or update.

#### Running a USDC Mainnet Pilot

- Set `BASE_CURRENCY=USDC` and your USDC mint in `.env`.
- Run the bot as usual (see Production Quickstart above).
- Limit to 3 trades or 10 minutes for pilot validation.
- Monitor logs for `[OrderSubmitted]`, `[OrderConfirmedEvent]`, `[TreasurySwap]`, `[PnL Summary]`.
- After the run, verify `data/treasury.json` balance has increased.

#### Test Coverage & Auditability

- Unit tests verify correct quoting and swap logic for both SOL and USDC base.
- Integration tests simulate profit swaps and assert correct treasury updates.
- All treasury activity is logged for full transparency.

### v2.6.0 Highlights

- **USDC Base Pair Support:** Trade any token with SOL or USDC as base currency. Toggle via `BASE_CURRENCY` env var.
- **Treasury Auto-Swap:** Profits from SOL trades (when using USDC base) are automatically swapped to USDC and recorded in a persistent treasury.
- **Treasury Auditability:** All treasury activity is logged and persisted for full audit trail.
- **Expanded Test Coverage:** Unit and integration tests for multi-pair logic and treasury profit recording.

### v2.5.0 Highlights

- **Ensemble Trading:** Runs both volatilitySqueeze and momentumBreakout in parallel, with dynamic capital allocation and weighted scheduling based on live ROI and volatility.
- **Per-Strategy Metrics:** Prometheus metrics for trades, PnL, and win rate per strategy; Grafana-ready for side-by-side comparison.
- **Mainnet Ensemble Pilot:** Validated ensemble performance with concurrent strategies on mainnet.

---

## Ensemble Trading

The bot supports running multiple alpha strategies in parallel, orchestrated by the StrategyCoordinator:

- **How it works:**
  - Both `volatilitySqueeze` and `momentumBreakout` strategies can be enabled and emit trade signals independently.
  - The coordinator tracks each strategy’s recent net PnL and win rate, and computes a weight proportional to ROI/volatility.
  - Capital is allocated to each strategy as:
    - `capitalForStrategy = totalBalance × (strategyWeight ÷ totalWeight)`
    - Each strategy is capped by its own `MAX_EXPOSURE_USD`.
  - Trades are scheduled in a weighted round-robin, so higher-performing strategies get more allocation.

- **Config Flags:**
  - `ENABLE_MOMENTUM` (default: true): Enable the momentumBreakout strategy.
  - `STRAT_WEIGHTS_INTERVAL` (default: 10): Number of trades to use for computing per-strategy weights.

- **Metrics:**
  - `/metrics` exposes:
    - `trades_total{strategy="..."}`
    - `net_pnl{strategy="..."}`
    - `win_rate{strategy="..."}`
  - Use Grafana to compare strategy performance side-by-side and monitor ensemble health.

- **Usage:**
  - Enable/disable strategies and tune weights via config or environment.
  - Monitor logs and dashboard for per-strategy events and performance.

---

### v2.4.0 Highlights

- **Self-Tuning Profit Path:** Automated live parameter feedback loop tunes core strategy thresholds every N trades based on real PnL, win rate, and drawdown. See below for details.
- **Mainnet Pilot Validation:** 10-minute dry-run with optimized parameters and full logging.
- **Dynamic Sizing Audit:** Unit-tested riskManager sizing logic for realistic volatility.
- **Metrics & Dashboard:** Prometheus endpoint now exposes parameter update counts for Grafana feedback loop panels.

---

## Self-Tuning Profit Path

The bot features a live feedback loop that automatically tunes key strategy parameters based on real trading performance:

- **How it works:**
  - After every batch of N confirmed trades (default: 5), the bot runs a mini-sweep of `priceChangeThreshold` and `volumeMultiplier` (±5% around current values).
  - For each parameter combo, it computes trade count, win rate, net PnL after costs, and max drawdown over the batch.
  - The best-performing combo is applied live for the next batch, and a `ParameterUpdateEvent` is emitted and counted in metrics.

- **Config Flags:**
  - `FEEDBACK_BATCH_SIZE` (default: 5): Number of trades per feedback batch.
  - `FEEDBACK_DELTA_PCT` (default: 0.05): Percent delta for parameter sweep (e.g., ±5%).

- **Metrics:**
  - Prometheus `/metrics` exposes `parameter_updates_total` for Grafana visualization.

- **Usage:**
  - Set flags in `.env` or config, or use defaults.
  - Monitor logs for `[ParameterUpdateEvent]` and dashboard for feedback loop impact.

---

### v2.3.0 Highlights

- **Unified Test Suite:** All tests migrated to Vitest; Jest fully removed; ESM & TypeScript support improved; CI/CD modernized with coverage enforcement.
- **Real On-Chain Cost Modeling:** Trade PnL now accounts for actual Solana transaction fees and swap slippage, fetched live. Trade logs and metrics include all costs.
- **Stop-Loss & Take-Profit Grid Search:** Automated script sweeps SL/TP parameters using pilot trade data. Best params are applied live and logged.
- **Loss-Protection Alerts:** Bot triggers high-priority alerts on >2 consecutive losses or drawdown breaches, with full test coverage.
- **Alternative Strategy Pilot:** Optionally run a secondary strategy (e.g., Momentum Breakout) in parallel for mainnet pilot and cost analysis. Toggle via config.
- **Metrics & Dashboard:** Metrics endpoint and trade logs now include fees, slippage, netPnL, and strategy attribution for advanced analysis.
- **Config Flags:** New flags for alternative strategy, parameter sweep, and alert thresholds. See below for usage.

---

## Usage for New Features

### Parameter Sweep & Application

```sh
pnpm tsx scripts/sweepStopLossTakeProfit.ts      # Run SL/TP grid search
pnpm tsx scripts/applySweepParams.ts             # Apply best SL/TP params to config
```

### Enable Alternative Strategy

- Add to your `.env` or config:
  - `ENABLE_ALTERNATIVE_STRATEGY=true`
- Or in `config.ts`:
  - `trading: { enableAlternativeStrategy: true }`

### Loss-Protection Alerts

- Alerts fire on >2 consecutive losses or drawdown > `drawdownAlertPct` (configurable).
- Alerts use Discord/Telegram as configured in `notificationManager`.

---

### v2.2.0 Highlights

- **Dynamic Position Sizing:** Trades are sized based on token volatility and account balance using the integrated RiskManager. No more fixed trade sizes; position adapts to market risk.
- **Live Parameter Feedback Loop:** The bot automatically sweeps and tunes key strategy parameters (e.g., priceChangeThreshold, volumeMultiplier) every 5 trades, applying the best-performing set live.
- **Concurrency & Cooldown:** Up to 3 tokens can be traded concurrently, with 60s cooldown enforced per token to avoid rapid re-trading. Managed by StrategyCoordinator.
- **Metrics & Monitoring:** All trades are logged to `data/trade_log.csv`. Trade logs now include strategy name, fee/slippage/netPnL. A Prometheus-compatible metrics server exposes trade stats, win rate, PnL, drawdown, parameter changes, and all cost metrics at `/metrics`.
- **Event-Driven Architecture:** Concurrency and trade signal management are handled via events for robust, scalable operation.

---

## Features

### Pattern Detection

### Mega Pump & Dump

- Detects when price increases by ≥ 40% over 12 hours and volume spikes ≥ 1.7× 12h SMA.
- Emits `PatternMatchEvent` with `{ address, strategy: "pumpDump", suggestedSOL: 1 }`.

### Smart Money Trap

- Detects when price increases by ≥ 15%, volume ≥ 0.8× 1h SMA, and buyRatio ≥ 1.8.
- Emits `PatternMatchEvent` with `{ address, strategy: "smartTrap", suggestedSOL: 1 }`.

### Exit Strategies

- After a pattern match trade, the bot schedules automated stop-loss and take-profit exits.
- Stop-loss: triggers at `entryPrice * (1 – STOP_LOSS_PCT/100)`.
- Take-profit: triggers at `entryPrice * (1 + TAKE_PROFIT_PCT/100)`.
- Emits `ExitFilledEvent` or `ExitTimeoutEvent` as appropriate.

### Example Config Flags

In your `.env` or config:

- `BASE_MINT` — The input token for swaps (default: SOL mint `So111...`).
- `MIN_LIQUIDITY_USD` — Minimum liquidity for token discovery (default: 10000 for mainnet dry-run).
- `TEST_TARGET_TOKEN` — If no real token is discovered within 60s, this SPL token address will be used for a forced dry-run trade.

#### Mainnet Dry-Run with Fallback

To run a mainnet dry-run that will always attempt a trade (even if no tokens are discovered):

```sh
NETWORK=mainnet LIVE_MODE=true BASE_MINT=So11111111111111111111111111111111111111112 TEST_TARGET_TOKEN=<SPL_TOKEN_ADDRESS> pnpm run dry-vol-sim -- --minutes 10 --max-trades 2
```

- The bot will skip swaps where `inputMint === outputMint` and log a warning.
- If no real tokens are found, it will use `TEST_TARGET_TOKEN` after 60 seconds.

```env
STOP_LOSS_PCT=10
TAKE_PROFIT_PCT=20
```

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
WALLET_SECRET_BASE58=your_base58_encoded_private_key
WALLET_ADDRESS=your_wallet_address

---

## v2.2.0 Release Notes

### Added
- **Dynamic Position Sizing** via RiskManager
- **Live Parameter Feedback Loop** for auto-tuning strategy parameters
- **Concurrency for up to 3 tokens** with cooldown management
- **Detailed trade logging** and **metrics server**

### Improved
- Event-driven concurrency and risk management
- Logging, error handling, and operational visibility

### How to Use
- See above: run as usual, but now with adaptive sizing, live tuning, and robust concurrency.
- Monitor `/metrics` and `data/trade_log.csv` for performance.

### Known Issues
- If all trades are losing, review stop-loss logic, price feed accuracy, and consider further tuning.

---

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
