import { Keypair } from '@solana/web3.js';
export declare class KeyRotationManager {
    private keypairs;
    private tradesPerKey;
    private currentIndex;
    private tradeCount;
    constructor(keypairs: Keypair[], tradesPerKey: number);
    nextKeypair(): Keypair;
    reset(): void;
}
//# sourceMappingURL=keyRotationManager.d.ts.map