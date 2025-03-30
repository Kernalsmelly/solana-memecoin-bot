"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenPrice = getTokenPrice;
exports.getTokenPriceHistory = getTokenPriceHistory;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./logger"));
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const BIRDEYE_API_URL = 'https://public-api.birdeye.so/public/price';
async function getTokenPrice(tokenAddress) {
    try {
        if (!BIRDEYE_API_KEY) {
            throw new Error('Birdeye API key not found');
        }
        const response = await axios_1.default.get(BIRDEYE_API_URL, {
            params: {
                address: tokenAddress.toString()
            },
            headers: {
                'x-api-key': BIRDEYE_API_KEY,
                'Accept': 'application/json'
            }
        });
        if (response.data && response.data.success && response.data.data && response.data.data.value) {
            return response.data.data.value;
        }
        throw new Error('Invalid response from Birdeye API');
    }
    catch (error) {
        logger_1.default.error('Failed to fetch token price:', error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}
async function getTokenPriceHistory(tokenAddress, timeframe = '1h') {
    try {
        if (!BIRDEYE_API_KEY) {
            throw new Error('Birdeye API key not found');
        }
        const response = await axios_1.default.get(`${BIRDEYE_API_URL}/history`, {
            params: {
                address: tokenAddress.toString(),
                timeframe
            },
            headers: {
                'x-api-key': BIRDEYE_API_KEY,
                'Accept': 'application/json'
            }
        });
        if (response.data && response.data.success && Array.isArray(response.data.data)) {
            return response.data.data;
        }
        throw new Error('Invalid response from Birdeye API');
    }
    catch (error) {
        logger_1.default.error('Failed to fetch price history:', error instanceof Error ? error.message : 'Unknown error');
        return [];
    }
}
