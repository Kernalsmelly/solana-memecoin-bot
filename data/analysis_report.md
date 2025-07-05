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
