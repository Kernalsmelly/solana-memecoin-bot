// src/connectionManager.ts

import { Connection, clusterApiUrl } from '@solana/web3.js';

export function getNetworkClusterUrl(): string {
  const network = process.env.NETWORK || 'devnet';
  if (network === 'mainnet') return clusterApiUrl('mainnet-beta');
  return clusterApiUrl('devnet');
}

class ConnectionManager {
  private static instance: ConnectionManager;
  private connection: Connection;

  private constructor() {
    // Connect to the correct cluster based on NETWORK env var
    this.connection = new Connection(getNetworkClusterUrl());
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
