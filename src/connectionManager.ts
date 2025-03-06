// src/connectionManager.ts

import { Connection, clusterApiUrl } from '@solana/web3.js';

class ConnectionManager {
  private static instance: ConnectionManager;
  private connection: Connection;

  private constructor() {
    // Connect to the mainnet-beta cluster (adjust as needed)
    this.connection = new Connection(clusterApiUrl('mainnet-beta'));
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  public async getConnection(): Promise<Connection> {
    return this.connection;
  }
  
  public getConnectionSync(): Connection {
    return this.connection;
  }
}

export default ConnectionManager;
