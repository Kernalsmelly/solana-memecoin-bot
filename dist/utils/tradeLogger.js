"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tradeLogger = exports.TradeLogger = void 0;
// src/utils/tradeLogger.ts
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("./logger"));
class TradeLogger {
    logSummary(summary) {
        const summaryFile = path.join(this.logDir, 'trade_summary.csv');
        const keys = Object.keys(summary);
        if (!fs.existsSync(summaryFile)) {
            fs.writeFileSync(summaryFile, keys.join(',') + '\n');
        }
        const row = keys.map(k => summary[k]).join(',') + '\n';
        try {
            fs.appendFileSync(summaryFile, row);
        }
        catch (error) {
            logger_1.default.error('Failed to write to trade summary log', error);
        }
    }
    logPoolDetection(pool) {
        const poolFile = path.join(this.logDir, 'pool_detection_log.csv');
        // Always include these fields in the header if present in the data
        const preferredOrder = [
            'timestamp', 'poolAddress', 'baseMint', 'quoteMint', 'lpMint', 'market', 'signature',
            'liquidityUsd', 'volume24hUsd', 'tokenName', 'tokenSymbol', 'tokenDecimals'
        ];
        // Merge preferred order with any extra fields
        const keys = preferredOrder.concat(Object.keys(pool).filter(k => !preferredOrder.includes(k)));
        if (!fs.existsSync(poolFile)) {
            fs.writeFileSync(poolFile, keys.join(',') + '\n');
        }
        const row = keys.map(k => pool[k] !== undefined ? pool[k] : '').join(',') + '\n';
        try {
            fs.appendFileSync(poolFile, row);
        }
        catch (error) {
            logger_1.default.error('Failed to write to pool detection log', error);
        }
    }
    logFile;
    logDir;
    constructor(logDir = path.resolve(__dirname, '..', '..', 'data')) {
        this.logDir = logDir;
        this.logFile = path.join(this.logDir, 'trade_log.csv');
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        // Write header if file does not exist
        if (!fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, 'timestamp,action,token,pairAddress,price,amount,pnl,reason,txid,success\n');
        }
    }
    log(entry) {
        const row = [
            entry.timestamp,
            entry.action,
            entry.token,
            entry.pairAddress || '',
            entry.price,
            entry.amount ?? '',
            entry.pnl ?? '',
            entry.reason.replace(/,/g, ';'),
            entry.txid || '',
            entry.success
        ].join(',') + '\n';
        try {
            fs.appendFileSync(this.logFile, row);
        }
        catch (error) {
            logger_1.default.error('Failed to write to trade log', error);
        }
    }
    /**
     * Logs a scenario event (e.g., circuit breaker, emergency stop, pattern trigger, error).
     * @param scenarioName Name of the scenario or event
     * @param details      Details or metadata (object or string)
     */
    logScenario(scenarioName, details) {
        const scenarioFile = path.join(this.logDir, 'scenario_log.csv');
        let detailsString;
        if (typeof details === 'string') {
            detailsString = details.replace(/,/g, ';');
        }
        else {
            detailsString = Object.entries(details).map(([k, v]) => `${k}=${String(v).replace(/,/g, ';')}`).join('; ');
        }
        const row = [
            new Date().toISOString(),
            scenarioName.replace(/,/g, ';'),
            detailsString
        ].join(',') + '\n';
        if (!fs.existsSync(scenarioFile)) {
            fs.writeFileSync(scenarioFile, 'timestamp,scenario,details\n');
        }
        try {
            fs.appendFileSync(scenarioFile, row);
        }
        catch (error) {
            logger_1.default.error('Failed to write to scenario log', error);
        }
    }
}
exports.TradeLogger = TradeLogger;
exports.tradeLogger = new TradeLogger();
//# sourceMappingURL=tradeLogger.js.map