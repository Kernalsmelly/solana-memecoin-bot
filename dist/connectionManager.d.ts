import { Connection } from '@solana/web3.js';
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