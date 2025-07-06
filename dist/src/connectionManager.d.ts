import { Connection } from '@solana/web3.js';
export declare function getNetworkClusterUrl(): string;
declare class ConnectionManager {
    private static instance;
    private connection;
    private constructor();
    static getInstance(): ConnectionManager;
    getConnection(): Promise<Connection>;
    getConnectionSync(): Connection;
}
export default ConnectionManager;
//# sourceMappingURL=connectionManager.d.ts.map