# Changelog

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
