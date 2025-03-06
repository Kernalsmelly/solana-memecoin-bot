"use strict";
// __tests__/tokenMonitor.test.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const tokenMonitor_1 = __importDefault(require("../src/tokenMonitor"));
const ws_1 = __importDefault(require("ws"));
// Mock the Jupiter module to prevent real network calls
jest.mock('@jup-ag/core', () => ({
    Jupiter: {
        load: jest.fn(() => Promise.resolve({}))
    }
}));
describe('TokenMonitor Module', () => {
    let tokenMonitor;
    let mockWebSocket;
    beforeEach(() => {
        // Create a new instance of TokenMonitor for each test.
        tokenMonitor = new tokenMonitor_1.default();
        // Create a simple mock WebSocket with the necessary methods.
        mockWebSocket = {
            send: jest.fn(),
            on: jest.fn(),
            ping: jest.fn(),
            readyState: ws_1.default.OPEN
        };
    });
    afterEach(() => {
        // Ensure that any intervals or open handles are cleared.
        tokenMonitor.shutdown();
    });
    test('subscribeToTokenUpdates sends the correct subscription message', () => {
        // @ts-ignore: accessing a method for testing purposes.
        tokenMonitor.subscribeToTokenUpdates(mockWebSocket, 'TestConnection');
        expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ action: 'subscribe', channel: 'tokenUpdates' }));
    });
    test('processWebSocketMessage emits priceUpdate event', async () => {
        const priceUpdateMessage = {
            type: 'priceUpdate',
            data: { price: 100 }
        };
        const emitSpy = jest.spyOn(tokenMonitor, 'emit');
        // @ts-ignore: accessing a method for testing purposes.
        await tokenMonitor.processWebSocketMessage(priceUpdateMessage, 'TestConnection');
        expect(emitSpy).toHaveBeenCalledWith('priceUpdate', { price: 100 });
    });
    test('processWebSocketMessage emits volumeSpike event', async () => {
        const volumeSpikeMessage = {
            type: 'volumeSpike',
            data: { volume: 5000 }
        };
        const emitSpy = jest.spyOn(tokenMonitor, 'emit');
        // @ts-ignore: accessing a method for testing purposes.
        await tokenMonitor.processWebSocketMessage(volumeSpikeMessage, 'TestConnection');
        expect(emitSpy).toHaveBeenCalledWith('volumeSpike', { volume: 5000 });
    });
});
