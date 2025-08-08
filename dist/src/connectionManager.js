// src/connectionManager.ts
import { Connection, clusterApiUrl } from '@solana/web3.js';
export function getNetworkClusterUrl() {
    const network = process.env.NETWORK || 'devnet';
    if (network === 'mainnet')
        return clusterApiUrl('mainnet-beta');
    return clusterApiUrl('devnet');
}
class ConnectionManager {
    static instance;
    connection;
    constructor() {
        // Connect to the correct cluster based on NETWORK env var
        this.connection = new Connection(getNetworkClusterUrl());
    }
    static getInstance() {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }
    async getConnection() {
        return this.connection;
    }
    getConnectionSync() {
        return this.connection;
    }
}
export default ConnectionManager;
//# sourceMappingURL=connectionManager.js.map