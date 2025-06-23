"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startStream = startStream;
const birdeyeAPI_1 = require("./birdeyeAPI");
/**
 * startStream sets up a Birdeye WebSocket stream for real-time token data.
 * If USE_PREMIUM_DATA is disabled, this is a no-op or yields mock data for tests/CI.
 * @param cb Callback invoked with token snapshot data
 */
function startStream(cb) {
    const usePremium = process.env.USE_PREMIUM_DATA === 'true';
    if (!usePremium) {
        // Optionally yield mock data, or just do nothing for tests/CI
        // Example mock (uncomment if you want to simulate events):
        // setTimeout(() => cb({ address: 'mock', priceUsd: 0.01, volume: 1000 }), 100);
        return;
    }
    const apiKey = process.env.BIRDEYE_API_KEY;
    if (!apiKey)
        throw new Error('Missing BIRDEYE_API_KEY');
    const birdeye = new birdeyeAPI_1.BirdeyeAPI(apiKey);
    // Attach event listeners for real-time data
    birdeye.on('tokenEvent', (event) => {
        cb(event.data);
    });
    // ... Insert actual WebSocket connection logic here ...
}
//# sourceMappingURL=birdeyeAPI.startStream.js.map