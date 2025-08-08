/**
 * startStream sets up a Birdeye WebSocket stream for real-time token data.
 * If USE_PREMIUM_DATA is disabled, this yields mock data for tests/CI.
 * @param cb Callback invoked with token snapshot data
 */
export function startStream(cb) {
    const usePremium = process.env.USE_PREMIUM_DATA === 'true';
    if (!usePremium && cb) {
        setTimeout(() => cb({ address: 'mock', priceUsd: 0.01, volume: 1000 }), 100);
        return;
    }
    // Real implementation would go here
}
//# sourceMappingURL=birdeyeAPI.startStream.js.map