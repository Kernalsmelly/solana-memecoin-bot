import WebSocket from 'ws';

const ws = new WebSocket('wss://api.dexscreener.com/latest/dex/tokens');

ws.on('message', (data) => {
    const tokenData = JSON.parse(data.toString());
    console.log('New Token Detected:', tokenData);
});

console.log("Token Monitor is running...");
