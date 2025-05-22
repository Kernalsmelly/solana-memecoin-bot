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
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPriceHistory = loadPriceHistory;
exports.getWindowedPrices = getWindowedPrices;
// src/utils/priceHistoryUtils.ts
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sync_1 = require("csv-parse/sync");
const priceHistoryFile = path.resolve(__dirname, '..', '..', 'data', 'price_history.csv');
function loadPriceHistory() {
    if (!fs.existsSync(priceHistoryFile))
        return [];
    const csv = fs.readFileSync(priceHistoryFile, 'utf-8');
    return (0, sync_1.parse)(csv, { columns: true, skip_empty_lines: true }).map((row) => ({
        timestamp: Number(row.timestamp),
        token: row.token,
        poolAddress: row.poolAddress,
        price: Number(row.price),
        liquidity: row.liquidity ? Number(row.liquidity) : undefined,
        volume: row.volume ? Number(row.volume) : undefined,
    }));
}
function getWindowedPrices(priceHistory, token, poolAddress, startTime, windowMs) {
    return priceHistory.filter(row => row.token === token &&
        (poolAddress === undefined || row.poolAddress === poolAddress) &&
        row.timestamp >= startTime &&
        row.timestamp <= startTime + windowMs);
}
//# sourceMappingURL=priceHistoryUtils.js.map