import { Connection } from '@solana/web3.js';
export declare class RpcRotator {
    private endpoints;
    private i;
    constructor(urls?: string[]);
    getConnection(): Connection;
    reportTimeout(url: string): void;
    reportSuccess(url: string): void;
}
//# sourceMappingURL=RpcRotator.d.ts.map