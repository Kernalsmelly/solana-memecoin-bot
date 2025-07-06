"use strict";
// src/connectionManager.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNetworkClusterUrl = getNetworkClusterUrl;
const web3_js_1 = require("@solana/web3.js");
function getNetworkClusterUrl() {
    const network = process.env.NETWORK || 'devnet';
    if (network === 'mainnet')
        return (0, web3_js_1.clusterApiUrl)('mainnet-beta');
    return (0, web3_js_1.clusterApiUrl)('devnet');
}
class ConnectionManager {
    static instance;
    connection;
    constructor() {
        // Connect to the correct cluster based on NETWORK env var
        this.connection = new web3_js_1.Connection(getNetworkClusterUrl());
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
exports.default = ConnectionManager;
//# sourceMappingURL=connectionManager.js.map