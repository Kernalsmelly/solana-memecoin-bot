import fs from 'fs';
import path from 'path';
// Try both SQLite and CSV, fallback to CSV if SQLite not present
const CSV_PATH = path.resolve('data', 'trade_history.csv');
function parseCsvTrades(file) {
    if (!fs.existsSync(file))
        return [];
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    if (lines.length < 2)
        return [];
    if (!lines[0])
        throw new Error('No header row found in input file.');
    const header = lines[0].split(',');
    return lines.slice(1).map((line) => {
        const values = line.split(',');
        const obj = {};
        header.forEach((k, i) => {
            obj[k] = values[i];
        });
        return obj;
    });
}
function summarize(trades) {
    if (!trades.length) {
        console.log('No trades found.');
        return;
    }
    const byToken = {};
    for (const t of trades) {
        const token = t.token || t.mint || t.symbol || 'UNKNOWN';
        if (!byToken[token])
            byToken[token] = [];
        byToken[token].push(t);
    }
    console.log('Token | Trades | Win% | Net PnL');
    console.log('----- | ------ | ---- | --------');
    for (const [token, arr] of Object.entries(byToken)) {
        const n = arr.length;
        const wins = arr.filter((t) => Number(t.pnl ?? t.profit ?? 0) > 0).length;
        const netPnl = arr.reduce((a, t) => a + Number(t.pnl ?? t.profit ?? 0), 0);
        const winPct = n ? Math.round((wins / n) * 100) : 0;
        console.log(`${token} | ${n} |${winPct}% | ${netPnl.toFixed(6)}`);
    }
}
const trades = parseCsvTrades(CSV_PATH);
summarize(trades);
//# sourceMappingURL=summarize_pilot.js.map