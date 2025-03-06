"use strict";
// src/tokenMonitor.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const core_1 = require("@jup-ag/core");
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const async_sema_1 = require("async-sema");
const connectionManager_1 = __importDefault(require("./connectionManager"));
class TokenMonitor extends events_1.EventEmitter {
    constructor() {
        super();
        this.isInitialized = false;
        this.connectionManager = connectionManager_1.default.getInstance();
        this.rateLimiter = (0, async_sema_1.RateLimit)(5); // Limit concurrent operations to 5
        this.initialize();
    }
    async initialize() {
        try {
            this.connection = await this.connectionManager.getConnection();
            await this.initializeJupiter();
            // Only set up WebSocket connections and periodic refresh if not in test mode.
            if (process.env.NODE_ENV !== 'test') {
                this.setupWebSockets();
                this.startPeriodicDataRefresh();
            }
            this.isInitialized = true;
        }
        catch (error) {
            this.handleError('initialization', error);
        }
    }
    async initializeJupiter() {
        try {
            // Use a dummy public key if no JUPITER_USER_AGENT is provided
            const userKey = process.env.JUPITER_USER_AGENT || "11111111111111111111111111111111";
            this.jupiter = await core_1.Jupiter.load({
                connection: this.connection,
                cluster: 'mainnet-beta',
                user: new web3_js_1.PublicKey(userKey)
            });
            console.log("Jupiter initialized successfully");
        }
        catch (error) {
            throw new Error(`Jupiter initialization failed: ${error.message}`);
        }
    }
    setupWebSockets() {
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
            let pingInterval;
            const connectWebSocket = () => {
                const ws = new ws_1.default(url, options);
                ws.on('open', () => {
                    console.log(`${name} WebSocket connection established`);
                    reconnectAttempts = 0;
                    this.subscribeToTokenUpdates(ws, name);
                    pingInterval = setInterval(() => {
                        if (ws.readyState === ws_1.default.OPEN) {
                            ws.ping();
                        }
                    }, 30000);
                });
                ws.on('message', async (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        await this.rateLimiter();
                        await this.processWebSocketMessage(message, name);
                    }
                    catch (error) {
                        this.emit('error', new Error(`${name} WebSocket message processing error: ${error.message}`));
                    }
                });
                ws.on('error', (error) => {
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
    subscribeToTokenUpdates(ws, connectionName) {
        const subscriptionMessage = JSON.stringify({
            action: 'subscribe',
            channel: 'tokenUpdates'
        });
        ws.send(subscriptionMessage);
        console.log(`Sent subscription message to ${connectionName}`);
    }
    async processWebSocketMessage(message, connectionName) {
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
    startPeriodicDataRefresh() {
        const refreshInterval = 60000; // Every 60 seconds
        this.refreshIntervalId = setInterval(async () => {
            try {
                console.log("Refreshing data...");
                await this.refreshData();
            }
            catch (error) {
                this.handleError('dataRefresh', error);
            }
        }, refreshInterval);
    }
    async refreshData() {
        console.log("Data refreshed successfully");
    }
    handleError(context, error) {
        console.error(`Error in ${context}:`, error);
    }
    shutdown() {
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
        }
        console.log("TokenMonitor shutdown completed.");
    }
}
exports.default = TokenMonitor;
