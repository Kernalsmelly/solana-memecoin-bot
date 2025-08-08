/**
 * Checks for recent natural swap volume on a token using dexscreener or birdeye APIs.
 * Returns true if swap volume in the last 5 minutes exceeds threshold.
 */
const lastCheck = {};
// TEMP: Mock for pilot/devnet - always return false to avoid 429s
export async function hasRecentNaturalVolume(tokenMint, minVolumeUsd = 1000) {
    console.log(`[MOCK] hasRecentNaturalVolume always returns false for token ${tokenMint} (pilot/devnet mode)`);
    return false;
}
//# sourceMappingURL=naturalVolumeDetector.js.map