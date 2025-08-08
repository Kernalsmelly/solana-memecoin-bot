# Solana Memecoin Bot: Mainnet Pattern Activation & Calibration

## Pattern-Based Trading Sprint

This sprint enables automatic calibration and activation of pattern-based strategies (VolatilitySqueeze) on Solana mainnet, with full logging, metrics, and notification support.

---

## How It Works

1. **Calibration/Backtest:**
   - Run `scripts/mainnet-backtest-pilot.ts` to backtest over the last 30 minutes of on-chain data for all seed tokens.
   - The bot grid-searches parameters (`PRICE_CHANGE_THRESHOLD`, `VOLUME_MULTIPLIER`) and selects the best by netPnL.
   - Results are logged and the best parameters are applied live via the self-tuning config/metrics system.

2. **Pattern-Only Mainnet Pilot:**
   - After calibration, the script runs live pattern detection on all seed tokens using the tuned parameters.
   - Pattern matches are logged, exposed as Prometheus metrics, and sent as Slack/Discord/Telegram notifications (if configured).

---

## Usage

```sh
pnpm tsx scripts/mainnet-backtest-pilot.ts
```

- Ensure your `.env` contains valid RPC URLs and notification settings.
- **Priority Fee (for fastest block inclusion):**
  - Set `FEE_PRIORITY` in your `.env` to control Solana priority fees (default: `0.0002`).
  - Example:
    ```
    FEE_PRIORITY=0.0002
    ```
- Seed tokens are configured in `data/seed_tokens.json`.
- Metrics are exposed via the `/metrics` endpoint (see Express handler in `src/metrics/parameterMetrics.ts`).

---

## Metrics & Notifications

- **Prometheus Metrics:**
  - `parameter_updates_total` — Number of parameter calibrations.
  - `pattern_match_total` — Number of pattern matches in the pilot run.
- **Slack/Discord/Telegram:**
  - Pattern matches and parameter updates are sent as notifications if you configure the NotificationManager in your environment.

---

## Extending

- To add more strategies (e.g., VolumeSpike), extend the grid search and simulation logic in `Trader.ts`.
- To add more tokens, edit `data/seed_tokens.json` or automate with DexScreener/Coingecko integration.
- For full trade execution, integrate the forced trade logic into your main trading engine.

---

## Testing

- Run unit tests with `pnpm vitest` (see `tests/patternCalibration.test.ts`).

---

## Security

- Private keys and sensitive config must be stored in `.env` and never committed.
- Forced trades and live trading require explicit enabling to avoid accidental execution.

---

## Support

For issues, reach out via Slack or open a GitHub issue in this repo.
