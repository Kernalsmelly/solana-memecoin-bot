"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const axios_1 = __importDefault(require("axios"));
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const RPC_URL = process.env.RPC_URL;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
if (!BIRDEYE_API_KEY || !RPC_URL || !WALLET_PRIVATE_KEY) {
    console.error('Missing BIRDEYE_API_KEY, RPC_URL, or WALLET_PRIVATE_KEY in .env');
    process.exit(1);
}
function filterPool(pool) {
    return pool.liquidityUsd >= 2000 && pool.mcapUsd <= 50000;
}
function logPool(pool) {
    console.log('[QUALIFIED POOL]', {
        tokenAddress: pool.address,
        ...pool,
    });
}
let found = false;
const POLL_INTERVAL = 5000; // 5 seconds
const END_AFTER = 60000; // 60 seconds
let pollTimer;
async function pollBirdeye() {
    if (found)
        return;
    try {
        // Birdeye's public API for pools (docs: https://docs.birdeye.so/reference/get_pools)
        const url = `https://public-api.birdeye.so/public/pool/all?sort_by=created_at&sort_type=desc&offset=0&limit=20`;
        const res = await axios_1.default.get(url, {
            headers: { 'X-API-KEY': BIRDEYE_API_KEY }
        });
        const data = res.data;
        if (data && Array.isArray(data.data)) {
            for (const pool of data.data) {
                if (filterPool(pool)) {
                    found = true;
                    logPool(pool);
                    break;
                }
            }
        }
    }
    catch (e) {
        if (e instanceof Error) {
            console.error('Error polling Birdeye:', e.message);
        }
        else {
            console.error('Error polling Birdeye:', e);
        }
    }
    if (!found) {
        pollTimer = setTimeout(pollBirdeye, POLL_INTERVAL);
    }
}
console.log('Polling Birdeye REST API for new pools...');
pollBirdeye();
setTimeout(() => {
    if (!found)
        console.log('No qualifying pool found in 60s.');
    process.exit(0);
}, END_AFTER);
//# sourceMappingURL=dryRun.js.map