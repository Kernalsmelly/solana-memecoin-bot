import { Transaction, VersionedTransaction, Connection, PublicKey } from '@solana/web3.js';
export type AnySolanaTx = Transaction | VersionedTransaction;
export interface Signer {
    publicKey: PublicKey;
    signAndSendTransaction(tx: AnySolanaTx, connection: Connection): Promise<string>;
}
export declare class MockSigner implements Signer {
    publicKey: PublicKey;
    constructor(pubkey?: string);
    signAndSendTransaction(tx: Transaction, connection: Connection): Promise<string>;
}
export declare class EnvVarSigner implements Signer {
    publicKey: PublicKey;
    private keypair;
    constructor();
    signAndSendTransaction(tx: Transaction | VersionedTransaction, connection: Connection): Promise<string>;
}
export declare class LedgerSigner implements Signer {
    publicKey: PublicKey;
    constructor();
    signAndSendTransaction(tx: Transaction, connection: Connection): Promise<string>;
}
//# sourceMappingURL=signer.d.ts.map