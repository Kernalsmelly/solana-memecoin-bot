import logger from './logger.js';
export class ForcedPumpManager {
    connection;
    wallet;
    config;
    forcedPumps = new Set();
    constructor(connection, wallet, config) {
        this.connection = connection;
        this.wallet = wallet;
        this.config = config;
    }
    /**
     * If no volume after waitSec, send a tiny buy to kickstart liquidity.
     * Returns true if forced pump executed.
     */
    async maybeForcePump(tokenMint, hasNaturalVolume) {
        if (hasNaturalVolume || this.forcedPumps.has(tokenMint.toBase58()))
            return false;
        logger.info(`[ForcedPump] Waiting ${this.config.waitSec}s for natural volume on ${tokenMint.toBase58()}...`);
        await new Promise((res) => setTimeout(res, this.config.waitSec * 1000));
        if (hasNaturalVolume || this.forcedPumps.has(tokenMint.toBase58()))
            return false;
        // Execute forced pump
        logger.info(`[ForcedPump] Executing forced pump: ${this.config.pumpSizeSol} SOL buy for ${tokenMint.toBase58()}`);
        // TODO: Replace with actual buy logic
        // await tradingEngine.buyToken(tokenMint, undefined, { forcedPump: true });
        this.forcedPumps.add(tokenMint.toBase58());
        // Metrics/logging
        logger.info(`[ForcedPump] forcedPump=true for ${tokenMint.toBase58()}`);
        // TODO: Increment forced_pump_executed_total metric
        return true;
    }
}
//# sourceMappingURL=forcedPumpManager.js.map