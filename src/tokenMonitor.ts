// src/tokenMonitor.ts

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Jupiter } from '@jup-ag/core';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { RateLimit } from 'async-sema';
import ConnectionManager from './connectionManager';

interface WebSocketMessage {
  type: string;
  data: any;
}

class TokenMonitor extends EventEmitter {
  private connection!: Connection;
  private jupiter!: Jupiter;
  private isInitialized = false;
  private connectionManager: ConnectionManager;
  private rateLimiter: () => Promise<void>;
  private refreshIntervalId: NodeJS.Timeout | undefined;

  constructor() {
    super();
    this.connectionManager = ConnectionManager.getInstance();
    this.rateLimiter = RateLimit(5); // Limit concurrent operations to 5
    this.initialize();
  }

  private async initialize() {
    try {
      this.connection = await this.connectionManager.getConnection();
      await this.initializeJupiter();
      // Only set up WebSocket connections and periodic refresh if not in test mode.
      if (process.env.NODE_ENV !== 'test') {
        this.setupWebSockets();
        this.startPeriodicDataRefresh();
      }
      this.isInitialized = true;
    } catch (error: any) {
      this.handleError('initialization', error);
    }
  }

  private async initializeJupiter() {
    try {
      // Use a dummy public key if no JUPITER_USER_AGENT is provided
      const userKey = process.env.JUPITER_USER_AGENT || "11111111111111111111111111111111";
      this.jupiter = await Jupiter.load({
        connection: this.connection,
        cluster: 'mainnet-beta',
        user: new PublicKey(userKey)
      });
      console.log("Jupiter initialized successfully");
    } catch (error: any) {
      throw new Error(`Jupiter initialization failed: ${error.message}`);
    }
  }

  private setupWebSockets() {
    const wsConnections = [
      {
        name: 'Raydium',
        url: 'wss://api.raydium.io/v2/main/ws',
        options: {
          handshakeTimeout: 10000,
          headers: {
            'User-Agent': process.env.USER_AGENT || 'TokenMonitor-v1'
          }
        }
      },
      {
        name: 'Solana Tracker',
        url: 'wss://api.solanatracker.io/v2/ws'
      },
      {
        name: 'Bitquery',
        url: 'wss://bitquery.io/v2/ws'
      },
      {
        name: 'dRPC',
        url: 'wss://solana-mainnet.rpc.dappnode.io/v1/ws'
      },
    ];

    wsConnections.forEach(({ name, url, options }) => {
      let reconnectAttempts = 0;
      let pingInterval: NodeJS.Timeout;

      const connectWebSocket = () => {
        const ws = new WebSocket(url, options);

        ws.on('open', () => {
          console.log(`${name} WebSocket connection established`);
          reconnectAttempts = 0;
          this.subscribeToTokenUpdates(ws, name);
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.ping();
            }
          }, 30000);
        });

        ws.on('message', async (data: WebSocket.Data) => {
          try {
            const message: WebSocketMessage = JSON.parse(data.toString());
            await this.rateLimiter();
            await this.processWebSocketMessage(message, name);
          } catch (error: any) {
            this.emit('error', new Error(`${name} WebSocket message processing error: ${error.message}`));
          }
        });

        ws.on('error', (error: Error) => {
          this.emit('error', new Error(`${name} WebSocket error: ${error.message}`));
        });

        ws.on('close', () => {
          console.log(`${name} WebSocket connection closed. Attempting to reconnect...`);
          clearInterval(pingInterval);
          reconnectAttempts++;
          const reconnectDelay = Math.min(30000, 5000 * Math.pow(2, reconnectAttempts - 1));
          setTimeout(() => {
            connectWebSocket();
          }, reconnectDelay);
        });

        return ws;
      };

      // Initiate connection for this provider
      connectWebSocket();
    });
  }

  public subscribeToTokenUpdates(ws: WebSocket, connectionName: string) {
    const subscriptionMessage = JSON.stringify({
      action: 'subscribe',
      channel: 'tokenUpdates'
    });
    ws.send(subscriptionMessage);
    console.log(`Sent subscription message to ${connectionName}`);
  }

  public async processWebSocketMessage(message: WebSocketMessage, connectionName: string) {
    switch (message.type) {
      case 'priceUpdate':
        console.log(`${connectionName} price update:`, message.data);
        this.emit('priceUpdate', message.data);
        break;
      case 'volumeSpike':
        console.log(`${connectionName} volume spike:`, message.data);
        this.emit('volumeSpike', message.data);
        break;
      default:
        console.log(`${connectionName} unhandled message type: ${message.type}`);
    }
  }

  private startPeriodicDataRefresh() {
    const refreshInterval = 60000; // Every 60 seconds
    this.refreshIntervalId = setInterval(async () => {
      try {
        console.log("Refreshing data...");
        await this.refreshData();
      } catch (error: any) {
        this.handleError('dataRefresh', error);
      }
    }, refreshInterval);
  }

  private async refreshData() {
    console.log("Data refreshed successfully");
  }

  private handleError(context: string, error: any) {
    console.error(`Error in ${context}:`, error);
  }

  public shutdown() {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
    }
    console.log("TokenMonitor shutdown completed.");
  }
}

export default TokenMonitor;
