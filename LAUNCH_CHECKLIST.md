# SolMemeBot Launch Checklist

## Pre-Launch Preparation

### System Verification
- [ ] Run pre-flight check: `node dist/utils/preFlightCheck.js`
- [ ] Verify configuration: `node dist/utils/verifyConfig.js`
- [ ] Test emergency stop: `node dist/utils/emergencyStop.js --reason="Test" --notify`
- [ ] Check portfolio status: `node dist/utils/fundManager.js check --save-report`

### Trading Parameters Verification
- [ ] **Position Sizing**
  - [ ] MAX_POSITION_SIZE: $50
  - [ ] MAX_ACTIVE_POSITIONS: 3
  - [ ] MAX_LIQUIDITY_PERCENTAGE: 5%
  
- [ ] **Risk Controls**
  - [ ] MAX_DAILY_LOSS_PERCENT: 5%
  - [ ] MAX_DRAWDOWN_PERCENT: 25.5%
  - [ ] MIN_SUCCESS_RATE: 80%
  
- [ ] **Circuit Breakers**
  - [ ] VOLATILITY_THRESHOLD: 65.2%
  - [ ] PRICE_DEVIATION_THRESHOLD: 15%
  - [ ] MAX_TRADES_PER_MINUTE: 3
  - [ ] MAX_TRADES_PER_HOUR: 15
  - [ ] MAX_TRADES_PER_DAY: 50

### Wallet Preparation
- [ ] Setup trading wallet with:
  - [ ] At least 0.2 SOL for gas fees
  - [ ] At least $100 USDC for trading capital
  - [ ] Record wallet address for tracking: ________________________

### API Keys Verification
- [ ] Solana RPC Endpoint: Set up and verified
- [ ] Birdeye API Key: Set up and verified
- [ ] Discord Webhook (optional): Set up and verified
- [ ] Telegram Bot (optional): Set up and verified

## Launch Sequence

### Step 1: Dry Run Mode (24 hours)
- [ ] Start dry run: `node dist/launch.js --dry-run`
- [ ] Monitor token detection
- [ ] Verify pattern identification
- [ ] Monitor dashboard at http://localhost:3000
- [ ] Confirm no unexpected errors in logs

### Step 2: Initial Capital Deployment (5%)
- [ ] Set INITIAL_CAPITAL_PERCENT=5 in .env
- [ ] Start production system: `NODE_ENV=production node dist/launch.js`
- [ ] Verify first successful detection and trade
- [ ] Check trading performance after 24 hours
- [ ] Confirm circuit breakers functioning correctly

### Step 3: Medium Capital Deployment (25%)
- [ ] After 48-hour proving period with no issues
- [ ] Set INITIAL_CAPITAL_PERCENT=25 in .env
- [ ] Restart system: `NODE_ENV=production node dist/launch.js`
- [ ] Monitor performance daily for next 72 hours

### Step 4: Full Capital Deployment (100%)
- [ ] After 1 week of stable operation
- [ ] Set INITIAL_CAPITAL_PERCENT=100 in .env
- [ ] Restart system: `NODE_ENV=production node dist/launch.js`
- [ ] Establish regular monitoring schedule

## Emergency Procedures

### Perform these steps if you notice any issues:

#### Mild Issues (Underperformance)
1. Reduce capital allocation: Set INITIAL_CAPITAL_PERCENT=10
2. Restart system

#### Moderate Issues (Unusual Behavior)
1. Trigger soft circuit breaker: `node dist/utils/emergencyStop.js --reason="Unusual behavior" --notify`
2. Investigate logs
3. Make necessary adjustments
4. Resume with reduced capital

#### Severe Issues (System Malfunction)
1. Trigger emergency stop: `node dist/utils/emergencyStop.js --reason="Critical error" --shutdown --notify`
2. Withdraw funds: `node dist/utils/fundManager.js withdraw --to-address=YOUR_COLD_WALLET --amount=ALL --notify`
3. Contact support

## Regular Maintenance

- [ ] Daily: Check dashboard for performance metrics
- [ ] Weekly: Review logs and update pattern performance stats
- [ ] Monthly: Run `node dist/utils/verifyConfig.js` to ensure all parameters are optimal
- [ ] Quarterly: Update blacklisted contract creators and pattern parameters

---

**FINAL VERIFICATION**

I verify that I have:
- [ ] Completed all pre-launch preparation steps
- [ ] Understood the launch sequence
- [ ] Reviewed emergency procedures
- [ ] Set up a maintenance schedule

Signed: __________________________

Date: ____________________________
