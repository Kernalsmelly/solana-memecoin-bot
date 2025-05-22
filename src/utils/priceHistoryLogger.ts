// src/utils/priceHistoryLogger.ts
import * as fs from 'fs';
import * as path from 'path';

const priceHistoryFile = path.resolve(__dirname, '..', '..', 'data', 'price_history.csv');

export function logPriceHistory({
    timestamp,
    token,
    poolAddress,
    price,
    liquidity,
    volume
}: {
    timestamp: number,
    token: string,
    poolAddress?: string,
    price: number,
    liquidity?: number,
    volume?: number
}) {
    const header = 'timestamp,token,poolAddress,price,liquidity,volume\n';
    const row = `${timestamp},${token},${poolAddress || ''},${price},${liquidity || ''},${volume || ''}\n`;
    let writeHeader = false;
    if (!fs.existsSync(priceHistoryFile)) writeHeader = true;
    const fd = fs.openSync(priceHistoryFile, 'a');
    try {
        if (writeHeader) fs.writeSync(fd, header);
        fs.writeSync(fd, row);
    } finally {
        fs.closeSync(fd);
    }
}
