import fs from 'fs';
import path from 'path';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const OPPS_FILE = path.join(DATA_DIR, 'scoredOpportunities.jsonl');
const TRADES_FILE = path.join(DATA_DIR, 'trades.jsonl');
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}
export async function persistOpportunity(opportunity) {
    ensureDataDir();
    const line = JSON.stringify({ ...opportunity, timestamp: Date.now() }) + '\n';
    await fs.promises.appendFile(OPPS_FILE, line, 'utf8');
}
export async function persistTrade(trade) {
    ensureDataDir();
    const line = JSON.stringify({ ...trade, timestamp: Date.now() }) + '\n';
    await fs.promises.appendFile(TRADES_FILE, line, 'utf8');
}
// Optionally, add summarization helpers here in the future.
const OPEN_POSITIONS_FILE = path.join(DATA_DIR, 'openPositions.json');
// Atomically save open positions with retries
export async function saveOpenPositions(positions, maxRetries = 3) {
    ensureDataDir();
    const tempFile = OPEN_POSITIONS_FILE + '.tmp';
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            await fs.promises.writeFile(tempFile, JSON.stringify(positions, null, 2), 'utf8');
            await fs.promises.rename(tempFile, OPEN_POSITIONS_FILE);
            return;
        }
        catch (err) {
            attempt++;
            if (attempt >= maxRetries)
                throw err;
            await new Promise((res) => setTimeout(res, 200 * attempt));
        }
    }
}
// Load open positions, back up corrupted files if parse fails
export async function loadOpenPositions() {
    ensureDataDir();
    if (!fs.existsSync(OPEN_POSITIONS_FILE))
        return [];
    const content = await fs.promises.readFile(OPEN_POSITIONS_FILE, 'utf8');
    try {
        return JSON.parse(content);
    }
    catch (err) {
        // Backup corrupted file
        const backupFile = OPEN_POSITIONS_FILE + '.corrupt_' + new Date().toISOString().replace(/[:.]/g, '-');
        try {
            await fs.promises.rename(OPEN_POSITIONS_FILE, backupFile);
        }
        catch (backupErr) {
            // Ignore backup errors, just log
            console.error('[Persistence] Failed to backup corrupt openPositions.json:', backupErr);
        }
        console.error('[Persistence] Corrupted openPositions.json detected and backed up:', backupFile, err);
        return [];
    }
}
//# sourceMappingURL=persistence.js.map