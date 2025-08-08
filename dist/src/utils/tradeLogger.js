// src/utils/tradeLogger.ts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class TradeLogger {
    logSummary(summary) {
        const summaryFile = path.join(this.logDir, 'trade_summary.csv');
        const keys = Object.keys(summary);
        if (!fs.existsSync(summaryFile)) {
            fs.writeFileSync(summaryFile, keys.join(',') + '\n');
        }
        const row = keys.map((k) => summary[k]).join(',') + '\n';
        try {
            fs.appendFileSync(summaryFile, row);
        }
        catch (error) {
            logger.error('Failed to write to trade summary log', error);
        }
    }
    logPoolDetection(pool) {
        const poolFile = path.join(this.logDir, 'pool_detection_log.csv');
        // Always include these fields in the header if present in the data
        const preferredOrder = [
            'timestamp',
            'poolAddress',
            'baseMint',
            'quoteMint',
            'lpMint',
            'market',
            'signature',
            'liquidityUsd',
            'volume24hUsd',
            'tokenName',
            'tokenSymbol',
            'tokenDecimals',
        ];
        // Merge preferred order with any extra fields
        const keys = preferredOrder.concat(Object.keys(pool).filter((k) => !preferredOrder.includes(k)));
        if (!fs.existsSync(poolFile)) {
            fs.writeFileSync(poolFile, keys.join(',') + '\n');
        }
        const row = keys.map((k) => (pool[k] !== undefined ? pool[k] : '')).join(',') + '\n';
        try {
            fs.appendFileSync(poolFile, row);
        }
        catch (error) {
            logger.error('Failed to write to pool detection log', error);
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
            fs.writeFileSync(this.logFile, 'timestamp,action,token,pairAddress,price,amount,pnl,reason,txid,success,strategyName,feePaidLamports,feePaidSol,slippageBps,netPnL\n');
        }
    }
    log(entry) {
        console.log('[tradeLogger] called with:', entry);
        const filePath = this.logFile;
        console.log('[tradeLogger] writing to', filePath);
        const row = [
            entry.timestamp,
            String(entry.action).toUpperCase(), // log as uppercase for emphasis
            entry.token,
            entry.pairAddress || '',
            entry.price,
            entry.amount ?? '',
            entry.pnl ?? '',
            String(entry.reason).replace(/,/g, ';'),
            entry.txid || '',
            entry.success,
            entry.strategyName ?? '',
            entry.feePaidLamports ?? '',
            entry.feePaidSol ?? '',
            entry.slippageBps ?? '',
            entry.netPnL ?? '',
        ].join(',') + '\n';
        console.log('[tradeLogger] writing row:', row);
        try {
            fs.appendFileSync(this.logFile, row);
            console.log('[tradeLogger] write success');
        }
        catch (error) {
            logger.error('Failed to write to trade log', error);
            console.error('[tradeLogger] write error:', error);
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
            detailsString = Object.entries(details)
                .map(([k, v]) => `${k}=${String(v).replace(/,/g, ';')}`)
                .join('; ');
        }
        const row = [new Date().toISOString(), scenarioName.replace(/,/g, ';'), detailsString].join(',') + '\n';
        if (!fs.existsSync(scenarioFile)) {
            fs.writeFileSync(scenarioFile, 'timestamp,scenario,details\n');
        }
        try {
            fs.appendFileSync(scenarioFile, row);
        }
        catch (error) {
            logger.error('Failed to write to scenario log', error);
        }
    }
}
export const tradeLogger = new TradeLogger();
//# sourceMappingURL=tradeLogger.js.map