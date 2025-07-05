// Tracks Solana RPC and API call volumes for cost/usage optimization
// Usage: wrap all RPC/API calls with trackRpcCall('methodName')

const callCounts: Record<string, number[]> = {};
const WINDOW = 60; // seconds

export function trackRpcCall(method: string) {
  const now = Math.floor(Date.now() / 1000);
  if (!callCounts[method]) callCounts[method] = [];
  callCounts[method].push(now);
}

export function getRpcCallStats() {
  const now = Math.floor(Date.now() / 1000);
  const stats: Record<string, number> = {};
  for (const [method, times] of Object.entries(callCounts)) {
    stats[method] = times.filter(t => now - t < WINDOW).length;
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
