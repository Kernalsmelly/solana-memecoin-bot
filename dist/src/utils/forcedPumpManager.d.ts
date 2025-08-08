import { Connection, PublicKey, Keypair } from '@solana/web3.js';
export interface ForcedPumpConfig {
    waitSec: number;
    pumpSizeSol: number;
}
export declare class ForcedPumpManager {
    private connection;
    private wallet;
    private config;
    private forcedPumps;
    constructor(connection: Connection, wallet: Keypair, config: ForcedPumpConfig);
    /**
     * If no volume after waitSec, send a tiny buy to kickstart liquidity.
     * Returns true if forced pump executed.
     */
    maybeForcePump(tokenMint: PublicKey, hasNaturalVolume: boolean): Promise<boolean>;
}
//# sourceMappingURL=forcedPumpManager.d.ts.map