// (diagnostic stub for ESM import crash)
export function startStream(cb) {
    const usePremium = process.env.USE_PREMIUM_DATA === 'true';
    if (!usePremium && cb) {
        setTimeout(() => cb({ address: 'mock', priceUsd: 0.01, volume: 1000 }), 100);
        return;
    }
    // Real implementation would go here
}
//# sourceMappingURL=birdeyeAPI.startStream2.js.map