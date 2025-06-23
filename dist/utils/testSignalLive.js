"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const discordNotifier_1 = require("./discordNotifier");
const signalLogger_1 = require("./signalLogger");
// This test script does NOT import or use config.ts.
(async () => {
    const payload = {
        type: 'BUY_SIGNAL',
        token: {
            mint: 'So11111111111111111111111111111111111111112',
            symbol: 'SOL',
            poolAddress: '8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x8x',
        },
        price: 111.11,
        liquidity: 55555,
        volume: 12345,
        buyRatio: 1.23,
        reason: 'Manual test signal (live system check)',
        links: {
            solscan: 'https://solscan.io/token/So11111111111111111111111111111111111111112',
            raydium: 'https://raydium.io/swap/?inputCurrency=SOL&outputCurrency=So11111111111111111111111111111111111111112',
        },
        timestamp: Date.now(),
    };
    await (0, discordNotifier_1.sendDiscordSignal)(payload);
    (0, signalLogger_1.logSignal)(payload);
    console.log('Manual test signal sent to Discord and signals.log!');
})();
//# sourceMappingURL=testSignalLive.js.map