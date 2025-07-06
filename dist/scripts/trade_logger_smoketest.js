"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tradeLogger_1 = require("../src/utils/tradeLogger");
tradeLogger_1.tradeLogger.log({
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
//# sourceMappingURL=trade_logger_smoketest.js.map