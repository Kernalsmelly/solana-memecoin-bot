/**
 * startStream sets up a Birdeye WebSocket stream for real-time token data.
 * If USE_PREMIUM_DATA is disabled, this is a no-op or yields mock data for tests/CI.
 * @param cb Callback invoked with token snapshot data
 */
export declare function startStream(cb: (snap: any) => void): void;
//# sourceMappingURL=birdeyeAPI.startStream.d.ts.map