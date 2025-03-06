"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/paperTradingExample.ts
const tradingSystem_1 = require("./tradingSystem");
function runPaperTrading() {
    return __awaiter(this, void 0, void 0, function* () {
        // Configure order execution options as needed.
        const tradingSystem = new tradingSystem_1.TradingSystem({
            maxOrderSize: 1000,
            exposureLimit: 800,
            slippageTolerance: 1,
            duplicateOrderTimeout: 60000,
        });
        yield tradingSystem.initialize();
        // Example trade order.
        const order = {
            tokenMint: "11111111111111111111111111111111",
            amount: 500,
            orderType: "market",
            slippageTolerance: 2,
            timeInForce: "GTC",
        };
        const result = yield tradingSystem.executeTrade(order);
        if (result.success) {
            console.log("Trade executed successfully:", result.orderId);
        }
        else {
            console.error("Trade execution failed:", result.errorMessage);
        }
        // Retrieve and display current positions.
        const positions = tradingSystem.getPositions();
        console.log("Current Positions:", positions);
        // When you're done, shutdown the system.
        tradingSystem.shutdown();
    });
}
runPaperTrading().catch((err) => console.error("Error in paper trading:", err));
