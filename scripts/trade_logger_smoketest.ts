import { tradeLogger } from '../src/utils/tradeLogger';

tradeLogger.log({
  timestamp: new Date().toISOString(),
  action: 'buy',
  token: 'TEST',
  pairAddress: 'TESTPAIR',
  price: 0.01,
  amount: 1,
  pnl: 0,
  reason: 'smoketest',
  txid: '',
  success: true
});
