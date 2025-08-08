# Solana Memecoin Bot – Devnet Testing & Tuning Guide

## Overview

This guide covers how to run, test, and tune the Solana Memecoin TradingEngine on Devnet. Use this workflow for safe experimentation, parameter optimization, and end-to-end validation before mainnet deployment.

---

## 1. Environment Setup

- **.env** must contain:
  - `SOLANA_PRIVATE_KEY` — 64 comma-separated numbers (no quotes/brackets)
  - `QUICKNODE_RPC_URL` — Devnet endpoint
  - All other trading/risk parameters as needed
  - `FEE_PRIORITY` — (optional) controls Solana priority fees for fastest block inclusion (default: 0.0002). Example:
    ```
    FEE_PRIORITY=0.0002
    ```

Example:

```
SOLANA_PRIVATE_KEY=67,133,60,106,144,65,79,25,182,78,35,103,179,131,226,40,58,223,148,132,147,236,100,47,202,250,169,117,147,56,172,236,9,34,0,109,0,141,168,144,248,147,178,97,197,202,36,32,156,7,94,99,64,83,80,12,92,117,65,29,92,65,134,229
```

---

## 2. Running the TradingEngine on Devnet

- Start with:
  ```sh
  pnpm tsx src/index.ts
  ```
- Confirm logs show wallet loaded, Devnet connection, and trading events.
- Airdrop SOL to your Devnet wallet if needed.

---

## 3. Parameter Tuning & Grid Sweeps

- Adjust `.env` for risk, slippage, position size, etc.
- Use `scripts/sl_tp_grid_sweep.ts` for systematic parameter optimization.
- Analyze logs and output to identify optimal configurations.

---

## 4. Notifications & Logging

- Critical events are logged by default.
- To test notifications, add real Discord/Telegram credentials to `.env`.
- Placeholders will cause harmless errors if not set.

---

## 5. Cleanup & Mainnet Prep

- Remove unused code and variables (e.g., `WALLET_SECRET_BASE58`).
- Document any changes or findings.
- When ready, update `.env` for mainnet keys and endpoints.

---

## 6. Troubleshooting

- **Wallet errors:** Ensure `SOLANA_PRIVATE_KEY` is 64 comma-separated numbers, no quotes/brackets.
- **Notification errors:** Ignore unless testing alerts; add real API keys to enable.
- **Devnet funding:** Use Solana faucet to airdrop SOL to your Devnet wallet.

---

## 7. Self-Tuning & Parameter Sweep

### Automated Parameter Optimization

- Define sweep ranges in `.env`:
  ```
  SWEEP_STOP_LOSS_RANGE=1,2,3
  SWEEP_TAKE_PROFIT_RANGE=1,2,3
  SWEEP_RISK_PCT_RANGE=0.002,0.005
  SWEEP_TRADES_PER_COMBO=3
  ```
- Run the sweep:
  ```bash
  pnpm run devnet-sweep
  # → “✅ Devnet sweep complete. Best params: { stopLossPct: X, takeProfitPct: Y, riskPct: Z }”
  ```
- The best-performing combination is auto-applied in-memory and metrics are updated.

### Metrics & Monitoring

- Visit `/metrics` to see:
  - `parameter_updates_total` (number of auto-tuning events)
  - `stop_loss_pct`, `take_profit_pct`, `risk_pct` (current live params)

### Pilot & Validation

- After a sweep, run a dry-run pilot:
  ```bash
  NETWORK=devnet LIVE_MODE=true pnpm tsx scripts/dry-vol-sim.ts --minutes 5 --max-trades 1
  # Check logs for [PnL Summary]
  ```
- Use results to validate parameter uplift before mainnet.

---

## 8. Next Steps

- After Devnet validation, update `.env` for mainnet and repeat key tests.
- Continue parameter tuning and strategy improvements as desired.

---

**For further help, see `src/utils/wallet.ts` or ask Cascade.**
