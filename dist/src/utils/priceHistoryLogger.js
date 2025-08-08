// src/utils/priceHistoryLogger.ts
import * as fs from 'fs';
import * as path from 'path';
const priceHistoryFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'data', 'price_history.csv');
export function logPriceHistory({ timestamp, token, poolAddress, price, liquidity, volume, }) {
    const header = 'timestamp,token,poolAddress,price,liquidity,volume\n';
    const row = `${timestamp},${token},${poolAddress || ''},${price},${liquidity || ''},${volume || ''}\n`;
    let writeHeader = false;
    if (!fs.existsSync(priceHistoryFile))
        writeHeader = true;
    const fd = fs.openSync(priceHistoryFile, 'a');
    try {
        if (writeHeader)
            fs.writeSync(fd, header);
        fs.writeSync(fd, row);
    }
    finally {
        fs.closeSync(fd);
    }
}
//# sourceMappingURL=priceHistoryLogger.js.map