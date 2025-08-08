import fs from 'fs';
import path from 'path';
const TREASURY_PATH = path.join(__dirname, '../data/treasury.json');
let treasuryBalance = 0;
function loadTreasury() {
    try {
        const data = fs.readFileSync(TREASURY_PATH, 'utf8');
        treasuryBalance = JSON.parse(data).balance || 0;
    }
    catch (e) {
        treasuryBalance = 0;
    }
}
function persistTreasury() {
    fs.writeFileSync(TREASURY_PATH, JSON.stringify({ balance: treasuryBalance }, null, 2));
}
export function getTreasuryBalance() {
    loadTreasury();
    return treasuryBalance;
}
export function recordProfit(usdcAmount) {
    loadTreasury();
    treasuryBalance += usdcAmount;
    persistTreasury();
}
//# sourceMappingURL=treasury.js.map