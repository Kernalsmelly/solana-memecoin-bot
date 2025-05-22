// src/utils/tradeLogger.ts
import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

export interface TradeLogEntry {
    timestamp: string;
    action: 'BUY' | 'SELL' | 'SKIP';
    token: string;
    pairAddress?: string;
    price: number;
    amount?: number;
    pnl?: number;
    reason: string;
    txid?: string;
    success: boolean;
}

export class TradeLogger {
    public logSummary(summary: Record<string, any>) {
        const summaryFile = path.join(this.logDir, 'trade_summary.csv');
        const keys = Object.keys(summary);
        if (!fs.existsSync(summaryFile)) {
            fs.writeFileSync(summaryFile, keys.join(',') + '\n');
        }
        const row = keys.map(k => summary[k]).join(',') + '\n';
        try {
            fs.appendFileSync(summaryFile, row);
        } catch (error) {
            logger.error('Failed to write to trade summary log', error);
        }
    }
    public logPoolDetection(pool: Record<string, any>) {
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
        } catch (error) {
            logger.error('Failed to write to pool detection log', error);
        }
    }
    private logFile: string;
    private logDir: string;

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

    public log(entry: TradeLogEntry) {
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
        } catch (error) {
            logger.error('Failed to write to trade log', error);
        }
    }
}

export const tradeLogger = new TradeLogger();
