# Changelog

## [2.1.0] - 2025-07-04

### Added

- High-availability Docker Compose with Redis pub/sub, healthchecks, and auto-restart
- Dynamic risk controls: volatility-based position sizing, max exposure, real stop-loss/take-profit
- Multi-strategy orchestration (`StrategyCoordinator`) with runtime enable/disable
- Advanced Prometheus metrics: trades/sec, avg PnL, drawdown, RPC call rates
- Alerting for drawdown, inactivity, and RPC errors (Slack/Discord/Telegram)
- RPC/API call volume tracking and metrics
- Automated parameter tuning: nightly sweep writes top configs to `config/auto-params.json`
- "Production Operations" documentation (deployment, fail-over, key rotation, monitoring)

### Changed

- Bot loads optimal parameters from nightly sweep config at runtime
- All services monitored and auto-restarting for resilience

### Fixed

- Improved error handling and alerting for mainnet trading

---

## [2.0.0] - 2025-07-04

### Added

- Real on-chain swap execution via Jupiter API (quote + swap, signed and sent on-chain)
- Hardware wallet (Ledger) signer abstraction (stub, ready for production integration)
- Dockerfile and docker-compose for production deployment
- Mainnet dry-run CI job and nightly parameter sweep automation
- Live dashboard: PnL and trade history charts, Prometheus `/metrics`, `/health` endpoint
- Parameter sweep CLI (`--sweep` flag) with top configs output to `sweep-report.json`

### Changed

- Modularized order execution and signer logic
- Enhanced documentation with Production Quickstart

### Fixed

- All tests pass, coverage enforced in CI
- Dashboard and monitoring endpoints now real-time and production-ready

---

See previous releases for earlier changes.
