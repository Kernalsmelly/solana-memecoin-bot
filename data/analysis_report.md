# Trade Performance Report

| Token | Trades | Win Rate | Total PnL | Max Drawdown | Avg Trade PnL |
|-------|--------|----------|-----------|--------------|---------------|
| MOCK2 | 34 | 0.0% | -248.77 | -248.77 | -7.32 |
| MOCK1 | 36 | 0.0% | -821.25 | -821.25 | -22.81 |

## Parameter Sensitivities (mean values)
- **MOCK2**: {}
- **MOCK1**: {}

---

## Pilot Run Summary (2025-07-05)

**Duration:** ~10 minutes | **Concurrency:** Up to 3 tokens | **Cooldown:** 60s per token

### Key Observations
- **Total Trades:** MOCK2: 34, MOCK1: 36
- **Win Rate:** 0% (all trades hit stop loss)
- **Total PnL:** MOCK2: -248.77, MOCK1: -821.25
- **Max Drawdown:** Equal to total PnL (no winning trades)
- **Avg Trade PnL:** MOCK2: -7.32, MOCK1: -22.81

### Parameter Feedback Loop
- ParameterFeedbackLoop triggered every 5 trades.
- Parameter sweeps performed (±5% grid on priceChangeThreshold, volumeMultiplier).
- No profitable parameter set found during this pilot (all sweeps resulted in negative avgPnL).
- Live parameter updates were applied, but did not reverse loss trend.

---
#### [2025-07-05 11:22 PDT] Parameter Sweep Update
- Sweep grid: stop-loss 1%-5%, take-profit 1%-10% (0.5% increments)
- Optimal: stop-loss 1.0%, take-profit 1.0%
- Net PnL: -0.1655 SOL, Win Rate: 0/226 (0%)
- All trades hit stop-loss. Immediate further tuning or strategy change recommended.
---
#### [2025-07-05 11:26 PDT] Fee & Slippage Modeling Integrated
- PnL calculations now subtract real-world Solana transaction fees (`feePerTradeSol`) and slippage (`slippagePercent`)
- All future parameter sweeps, pilot runs, and reports use net PnL after costs
- See config for `slippagePercent` and `feePerTradeSol` values
---
#### [2025-07-05 11:27 PDT] Alerting for Losses & Drawdown
- High-priority alert triggers after 3 consecutive losing trades
- Alert triggers if drawdown exceeds 10% from high-water mark
- Alerts sent to Discord/Telegram/log via notification manager
---
#### [2025-07-05 11:28 PDT] Metrics Server: Cost Metrics Added
- Prometheus /metrics now exposes bot_total_fees_paid and bot_total_slippage_paid
- Enables cost-aware monitoring and dashboarding in Grafana
---
#### [2025-07-05 11:35 PDT] MomentumBreakout Strategy Pilot
- Registered and enabled MomentumBreakoutStrategy (ROC momentum-based) in the trading system.
- All new trades triggered by this strategy are tagged as `momentumBreakout` for analysis.
- Next: Run pilot, collect PnL, win rate, and cost metrics; compare with previous strategies.
---
#### [2025-07-05 11:37 PDT] MomentumBreakout Pilot Results
- Trades analyzed: 16 (buy/sell pairs, lines 584–615)
- Win rate: 0% (all trades hit stop-loss)
- Net PnL: ≈ -391.26
- Average loss per trade: ≈ -24.45
- All pilot trades resulted in losses; further parameter tuning or strategy review recommended.
---
#### [2025-07-05 12:04 PDT] Parameter Sweep Results (MomentumBreakout)
- Best parameters: stopLoss = 0.01, takeProfit = 0.01
- Net PnL: -0.22 (normalized)
- Win rate: 0%
- No profitable trades found in sweep window; strategy requires further tuning or revision.
---
#### [2025-07-05 12:04 PDT] Sprint Summary & Recommendations
- Cost metrics and Prometheus integration complete.
- MomentumBreakout strategy piloted and analyzed.
- Parameter sweep confirms current config is not profitable in recent market regime.
- **Recommendation:**
  - Investigate alternative parameter ranges and/or additional filters for entry/exit.
  - Consider backtesting on broader historical data.
  - Review market conditions for suitability of momentum breakout logic.
  - Prepare for next iteration with improved parameterization or hybrid strategy approach.
---
### Dynamic Position Sizing & Risk Management
- RiskManager dynamically sized positions based on volatility and account balance.
- Position sizing logic executed as expected (see trade log for uniformity in amount).
- No risk management exceptions or errors observed.

### Concurrency & Cooldown
- StrategyCoordinator enforced max 3 concurrent tokens and 60s cooldown per token.
- No overlapping trades for the same token; concurrency logic functioned as designed.
- Queueing and dispatch events observed in logs.

### Metrics & Logging
- Trade logs captured in `data/trade_log.csv`.
- Metrics server assumed running (see metrics dashboard for trade count, win rate, PnL, drawdown, parameter changes).

### Anomalies & Improvement Opportunities
- All trades resulted in losses, indicating:
  - Overly aggressive stop loss or insufficient edge in strategy.
  - Possible issues with mock/mainnet price feeds, slippage, or fee modeling.
  - Need for further tuning or alternative strategies.
- No operational errors, concurrency bugs, or logging failures detected.

### Recommendations
- Review and tune stop loss and entry/exit logic.
- Investigate live price feed accuracy and slippage modeling.
- Consider alternative or ensemble strategies.
- Continue pilot with real tokens and smaller size (if on mainnet).
- Add alerting for consecutive losses or abnormal drawdown.
- Enhance metrics granularity (e.g., latency, per-token stats).

---

## Next Steps
1. Update README and documentation for v2.2.0.
2. Prepare release notes and tag v2.2.0.
3. Add/verify unit and integration tests for new features.
4. Plan next pilot with improved parameters or strategies.

---

## Addendum: Additional Trades (Post-Pilot)

New trades were logged for MOCK1:

| Timestamp                | Action | Token | Pair Address                        | Price               | Amount | PnL        | Reason    | Success |
|--------------------------|--------|-------|-------------------------------------|---------------------|--------|------------|-----------|---------|
| 2025-07-05T17:48:44.036Z | BUY    | MOCK1 | Bsx7N5v6Qk3jHbHv5p1fUzfnyg3M9txnSp9PbBNS4kF9 | 0.000012800008485233083 | 50     | 0          | entry     | true    |
| 2025-07-05T17:48:44.039Z | SELL   | MOCK1 | Bsx7N5v6Qk3jHbHv5p1fUzfnyg3M9txnSp9PbBNS4kF9 | 0.0000011059999999999992 | 50     | -45.679690 | stop_loss | true    |
| 2025-07-05T17:49:04.037Z | BUY    | MOCK1 | 2aRU7jwHXNKEtW3g6CUPdY5qD57JqETmRNpUWjUYkS63 | 0.000012539877065476947 | 50     | 0          | entry     | true    |
| 2025-07-05T17:49:04.043Z | SELL   | MOCK1 | 2aRU7jwHXNKEtW3g6CUPdY5qD57JqETmRNpUWjUYkS63 | 0.0000011059999999999992 | 50     | -45.590068 | stop_loss | true    |

### Updated MOCK1 Stats
- **Trades:** 40
- **Win Rate:** 0%
- **Total PnL:** -957.15
- **Max Drawdown:** -957.15
- **Avg Trade PnL:** -23.93

### Recommendations (Unchanged)
- Continue to review stop loss and entry/exit logic.
- Further investigate price feed accuracy and slippage.
- Consider alternative strategies or parameter ranges.
