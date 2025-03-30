# SolMemeBot - Production Deployment Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Production Requirements](#production-requirements)
3. [Configuration Setup](#configuration-setup)
4. [Deployment Procedure](#deployment-procedure)
5. [Monitoring & Management](#monitoring--management)
6. [Emergency Procedures](#emergency-procedures)
7. [Maintenance & Updates](#maintenance--updates)
8. [Performance Optimization](#performance-optimization)

## System Overview

SolMemeBot is an advanced trading system for Solana memecoins with the following features:

- **Real-Time Token Discovery**: Monitors DEX activity to identify promising new tokens
- **Pattern Detection System**: Identifies profitable trading patterns like Mega Pump and Dump
- **Risk Management System**: Includes circuit breakers, emergency stops, and position limits
- **Production-Ready Infrastructure**: Built with reliability, monitoring, and safety in mind

### Key Components

- **Token Discovery Engine**: Processes DEX data to find new tokens matching criteria
- **Pattern Detector**: Analyzes price action to identify profitable entry points
- **Risk Manager**: Monitors and controls trading risk parameters
- **Order Execution System**: Handles trade execution through Jupiter DEX
- **Exit Manager**: Advanced position management with multiple exit strategies
- **Monitoring Dashboard**: Real-time performance and status monitoring

## Production Requirements

### Hardware Requirements

- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 50GB SSD
- **Network**: Reliable high-speed connection with low latency

### Software Requirements

- **Node.js**: v16+ (v18+ recommended)
- **PM2**: For process management
- **Linux**: Ubuntu 20.04 or higher recommended

### Accounts & API Keys

- **Solana Wallet**: Hot wallet for trading (limited funds)
- **RPC Provider**: High-quality Solana RPC endpoint (Quicknode/Alchemy/Triton)
- **Birdeye API Key**: For token discovery and real-time data
- **Discord/Telegram**: For notifications and alerts

## Configuration Setup

### Environment Variables

Create a `.env` file in the project root with the following settings:

```
# Core Configuration
NODE_ENV=production
PRIVATE_KEY=your_wallet_private_key
RPC_ENDPOINT=https://your-rpc-provider.com

# API Keys
BIRDEYE_API_KEY=your_birdeye_api_key
DISCORD_WEBHOOK_URL=your_discord_webhook
TELEGRAM_BOT_TOKEN=your_telegram_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Risk Parameters
MAX_POSITION_SIZE=50
MAX_ACTIVE_POSITIONS=3
MAX_DAILY_LOSS_PERCENT=5
MAX_DRAWDOWN_PERCENT=10
MAX_SLIPPAGE_BPS=100

# Circuit Breakers
VOLATILITY_THRESHOLD=10
PRICE_DEVIATION_THRESHOLD=5
MAX_TRADES_PER_MINUTE=5
MAX_TRADES_PER_HOUR=20
MAX_TRADES_PER_DAY=100
MIN_SUCCESS_RATE=80

# Token Discovery
MIN_LIQUIDITY=50000
MIN_TRANSACTIONS_5MIN=5
MAX_TOKEN_AGE=24
VOLUME_LIQUIDITY_RATIO=0.05

# Deployment Control
INITIAL_CAPITAL_PERCENT=10
PROVING_PERIOD_HOURS=48
FULL_CAPITAL_RELEASE_HOURS=168

# Dashboard
DASHBOARD_PORT=3000
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=your_secure_password
```

### Trading Parameters

Optimal settings based on historical pattern performance:

| Pattern | Take Profit | Stop Loss | Trailing % | Max Time |
|---------|-------------|-----------|------------|----------|
| Mega Pump and Dump | 120% | -20% | 20% | 12h |
| Volatility Squeeze | 50% | -15% | 15% | 8h |
| Smart Money Trap | 40% | -12% | 15% | 16h |
| Algorithmic Stop Hunt | 50% | -15% | 12% | 24h |
| Smart Money Reversal | 45% | -15% | 15% | 24h |

## Deployment Procedure

### 1. Project Setup

```bash
# Clone repository (if not already done)
git clone https://github.com/yourusername/solmemebot.git
cd solmemebot

# Install dependencies
npm install

# Build project
npm run build
```

### 2. Configuration Verification

```bash
# Verify configuration
node dist/utils/verifyConfig.js
```

Review the output carefully and ensure all required parameters are set correctly.

### 3. Dry Run Testing

```bash
# Run in dry run mode for 24 hours
node dist/launch.js --dry-run
```

Monitor the system during dry run to ensure:
- Token discovery is working
- Patterns are being detected
- Circuit breakers trigger appropriately
- No unexpected errors occur

### 4. Phased Production Deployment

```bash
# Start with minimal capital (10%)
NODE_ENV=production node dist/launch.js
```

The system will automatically:
1. Start with 10% of configured capital
2. Increase to 50% after the proving period (default: 48h)
3. Increase to 100% after the full release period (default: 168h)

### 5. Process Management

```bash
# Create PM2 configuration
cat > ecosystem.config.js << EOL
module.exports = {
  apps: [{
    name: 'solmemebot',
    script: 'dist/launch.js',
    env: {
      NODE_ENV: 'production'
    },
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    merge_logs: true,
    restart_delay: 5000,
    max_restarts: 10
  }]
};
EOL

# Start with PM2
pm2 start ecosystem.config.js
```

## Monitoring & Management

### Dashboard Access

The performance dashboard is accessible at `http://your-server-ip:3000` with the credentials set in your `.env` file.

### Key Metrics to Monitor

- **Circuit Breaker Status**: Should normally show 'None Active'
- **Win Rate**: Should remain above 80%
- **Drawdown**: Should remain below MAX_DRAWDOWN_PERCENT
- **Daily P&L**: Watch for consistent negative days
- **Success Rate**: Should remain above MIN_SUCCESS_RATE

### Log Monitoring

```bash
# View live logs
pm2 logs solmemebot

# View error logs
tail -f logs/error.log
```

### Production Commands

```bash
# Check portfolio status
node dist/utils/fundManager.js check --save-report

# Withdraw funds to cold wallet
node dist/utils/fundManager.js withdraw --amount=50 --to-address=YOUR_COLD_WALLET

# Check system status
pm2 status solmemebot
```

## Emergency Procedures

### Emergency Stop

If you detect unusual behavior or market conditions:

```bash
# Trigger emergency stop
node dist/utils/emergencyStop.js --reason="Unusual market conditions" --notify --save-state
```

### Recovery Procedure

After resolving issues:

1. Review emergency state file in `./emergency-states/`
2. Fix any identified issues
3. Restart with reduced capital:

```bash
# Update configuration
echo "INITIAL_CAPITAL_PERCENT=5" >> .env

# Restart system
pm2 restart solmemebot
```

### Portfolio Withdrawal

In case of severe market conditions:

```bash
# Emergency withdrawal of all funds
node dist/utils/fundManager.js withdraw --all --to-address=YOUR_COLD_WALLET --notify
```

## Maintenance & Updates

### Database Maintenance

```bash
# Backup performance data
mkdir -p backups
tar -czf backups/performance-data-$(date +%Y%m%d).tar.gz data/performance/
```

### System Updates

```bash
# Update from repository
git pull
npm install
npm run build
pm2 restart solmemebot
```

## Performance Optimization

### RPC Provider

For optimal performance:
- Use a dedicated RPC endpoint
- Consider using multiple RPC providers for redundancy
- Implement proper rate limiting (already configured in system)

### Memory Management

If running for extended periods, schedule weekly restarts:

```bash
# Add to crontab
echo "0 0 * * 0 pm2 restart solmemebot" | crontab -
```

### Pattern Tuning

After accumulating trading data, periodically review and adjust:
- Pattern detection parameters
- Exit strategy settings
- Risk management thresholds

Use the performance dashboard to identify which patterns are performing best in current market conditions.

---

This guide provides the foundation for running SolMemeBot in production. Always monitor the system closely, especially in the first weeks of operation, and be prepared to make adjustments as needed.
