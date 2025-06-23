"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistOpportunity = persistOpportunity;
exports.persistTrade = persistTrade;
exports.saveOpenPositions = saveOpenPositions;
exports.loadOpenPositions = loadOpenPositions;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.resolve(process.cwd(), 'data');
const OPPS_FILE = path_1.default.join(DATA_DIR, 'scoredOpportunities.jsonl');
const TRADES_FILE = path_1.default.join(DATA_DIR, 'trades.jsonl');
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
}
async function persistOpportunity(opportunity) {
    ensureDataDir();
    const line = JSON.stringify({ ...opportunity, timestamp: Date.now() }) + '\n';
    await fs_1.default.promises.appendFile(OPPS_FILE, line, 'utf8');
}
async function persistTrade(trade) {
    ensureDataDir();
    const line = JSON.stringify({ ...trade, timestamp: Date.now() }) + '\n';
    await fs_1.default.promises.appendFile(TRADES_FILE, line, 'utf8');
}
// Optionally, add summarization helpers here in the future.
const OPEN_POSITIONS_FILE = path_1.default.join(DATA_DIR, 'openPositions.json');
// Atomically save open positions with retries
async function saveOpenPositions(positions, maxRetries = 3) {
    ensureDataDir();
    const tempFile = OPEN_POSITIONS_FILE + '.tmp';
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            await fs_1.default.promises.writeFile(tempFile, JSON.stringify(positions, null, 2), 'utf8');
            await fs_1.default.promises.rename(tempFile, OPEN_POSITIONS_FILE);
            return;
        }
        catch (err) {
            attempt++;
            if (attempt >= maxRetries)
                throw err;
            await new Promise(res => setTimeout(res, 200 * attempt));
        }
    }
}
// Load open positions, back up corrupted files if parse fails
async function loadOpenPositions() {
    ensureDataDir();
    if (!fs_1.default.existsSync(OPEN_POSITIONS_FILE))
        return [];
    const content = await fs_1.default.promises.readFile(OPEN_POSITIONS_FILE, 'utf8');
    try {
        return JSON.parse(content);
    }
    catch (err) {
        // Backup corrupted file
        const backupFile = OPEN_POSITIONS_FILE + '.corrupt_' + new Date().toISOString().replace(/[:.]/g, '-');
        try {
            await fs_1.default.promises.rename(OPEN_POSITIONS_FILE, backupFile);
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