# Solana Memecoin Bot - Secret Sauce Optimizations

This document outlines the high-frequency trading optimizations ("secret sauce") implemented in version 2.8.4 of the Solana Memecoin Bot.

## Key Features

### 1. Whale Signal Detection

- Real-time monitoring of SPL Token transfers
- Detects large USDC deposits (default: $50,000+)
- Temporarily reduces pump thresholds for affected tokens
- Window size configurable via `WHALE_WINDOW_SEC` (default: 30s)

### 2. Forced Pump Injection

- Injects small SOL buys into tokens with no recent volume
- Size configurable via `FORCED_PUMP_SIZE` (default: 0.0005 SOL)
- Wait time configurable via `FORCED_PUMP_WAIT_SEC` (default: 30s)
- Tracks forced pump performance via metrics

### 3. Priority Fee Tipping

- Dynamic priority fee adjustment based on network latency
- Target latency: 20ms
- Fee range: 0.5x to 2x base fee (default base: 0.0002 SOL)
- Saves tracked via `priority_fee_saves_total` metric

### 4. Key Rotation

- Rotates through multiple keypairs to avoid rate limits
- Number of trades per key configurable via `KEY_ROTATION_TRADES`
- Supports multi-key rotation via `SOLANA_PRIVATE_KEYS` env var
- Rotation count tracked via `key_rotation_count` metric

## Environment Variables

```bash
# Whale Signal Configuration
WHALE_SIGNAL_USDC=50000        # USDC threshold for whale detection
WHALE_WINDOW_SEC=30            # Window duration for whale signal effect

# Forced Pump Configuration
FORCED_PUMP_WAIT_SEC=30        # Seconds to wait before forced pump
FORCED_PUMP_SIZE=0.0005        # Size in SOL for forced pump

# Priority Fee Configuration
FEE_PRIORITY=0.0002            # Base priority fee in SOL

# Key Rotation Configuration
KEY_ROTATION_TRADES=5          # Number of trades per key before rotation
SOLANA_PRIVATE_KEYS="..."      # Semicolon-separated keypairs for rotation
```

## Metrics

The system tracks several important metrics:

- `whale_signal_triggers_total`: Number of whale signals detected
- `forced_pump_executed_total`: Number of forced pumps executed
- `priority_fee_saves_total`: Number of priority fee adjustments
- `key_rotation_count`: Number of key rotations
- `tx_send_latency_ms`: Transaction send latency histogram

## Usage

To run the pilot with all secret sauce features:

```bash
NETWORK=devnet \
LIVE_MODE=true \
SIMULATION_MODE=true \
WHALE_SIGNAL_USDC=50000 \
FORCED_PUMP_WAIT_SEC=30 \
FORCED_PUMP_SIZE=0.0005 \
KEY_ROTATION_TRADES=5 \
pnpm run pilot_secret_sauce -- --minutes 15 --max-trades 5
```

## Backtesting

To run backtests of the secret sauce features:

```bash
pnpm run backtest_secret_sauce -- --minutes 15 --max-trades 5
```

The backtest script simulates whale signals and forced pumps, measuring their impact on performance and latency.
