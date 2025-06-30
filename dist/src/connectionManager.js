"use strict";
// src/connectionManager.ts
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
class ConnectionManager {
    static instance;
    connection;
    constructor() {
        // Connect to the mainnet-beta cluster (adjust as needed)
        this.connection = new web3_js_1.Connection((0, web3_js_1.clusterApiUrl)('mainnet-beta'));
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