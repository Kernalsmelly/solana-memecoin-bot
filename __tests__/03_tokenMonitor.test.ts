// __tests__/tokenMonitor.test.ts

import TokenMonitor from '../src/tokenMonitor';
import WebSocket from 'ws';

// Mock the Jupiter module to prevent real network calls
jest.mock('@jup-ag/core', () => ({
  Jupiter: {
    load: jest.fn(() => Promise.resolve({}))
  }
}));

describe('TokenMonitor Module', () => {
  let tokenMonitor: TokenMonitor;
  let mockWebSocket: any;

  beforeEach(() => {
    // Create a new instance of TokenMonitor for each test.
    tokenMonitor = new TokenMonitor();

    // Create a simple mock WebSocket with the necessary methods.
    mockWebSocket = {
      send: jest.fn(),
      on: jest.fn(),
      ping: jest.fn(),
      readyState: WebSocket.OPEN
    };
  });

  afterEach(() => {
    // Ensure that any intervals or open handles are cleared.
    tokenMonitor.shutdown();
  });

  test('subscribeToTokenUpdates sends the correct subscription message', () => {
    // @ts-ignore: accessing a method for testing purposes.
    tokenMonitor.subscribeToTokenUpdates(mockWebSocket, 'TestConnection');
    expect(mockWebSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'subscribe', channel: 'tokenUpdates' })
    );
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
