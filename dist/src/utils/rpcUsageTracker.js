// Tracks Solana RPC and API call volumes for cost/usage optimization
// Usage: wrap all RPC/API calls with trackRpcCall('methodName')
const callCounts = {};
const WINDOW = 60; // seconds
export function trackRpcCall(method) {
    const now = Math.floor(Date.now() / 1000);
    if (!callCounts[method])
        callCounts[method] = [];
    callCounts[method].push(now);
}
export function getRpcCallStats() {
    const now = Math.floor(Date.now() / 1000);
    const stats = {};
    for (const [method, times] of Object.entries(callCounts)) {
        stats[method] = times.filter((t) => now - t < WINDOW).length;
    }
    return stats;
}
// Optionally export Prometheus metrics
export function getRpcCallMetricsPrometheus() {
    const stats = getRpcCallStats();
    return Object.entries(stats)
        .map(([method, count]) => `rpc_calls_${method} ${count}`)
        .join('\n');
}
//# sourceMappingURL=rpcUsageTracker.js.map