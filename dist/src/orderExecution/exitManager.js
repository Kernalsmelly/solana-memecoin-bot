"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitManager = void 0;
const events_1 = __importDefault(require("events"));
class ExitManager extends events_1.default {
    orderManager;
    exits = new Map();
    timeoutMs = 15 * 60 * 1000; // 15 min default
    constructor(orderManager, timeoutMs) {
        super();
        this.orderManager = orderManager;
        if (timeoutMs)
            this.timeoutMs = timeoutMs;
    }
    scheduleExit(parent, entryPrice) {
        const stopLoss = entryPrice * 0.98;
        const takeProfit = entryPrice * 1.02;
        const exit = {
            parentSignature: parent.signature,
            stopLossPrice: stopLoss,
            takeProfitPrice: takeProfit,
            status: 'pending',
        };
        this.exits.set(parent.signature, exit);
        this.monitorExit(exit);
    }
    monitorExit(exit) {
        // In real system, poll price feed and trigger exit logic
        const check = async () => {
            // TODO: Integrate with price feed to check if stop-loss/take-profit hit
            // For now, simulate timeout
            setTimeout(() => {
                if (exit.status === 'pending') {
                    exit.status = 'timeout';
                    this.emit('exitTimeout', exit);
                }
            }, this.timeoutMs);
        };
        check();
    }
    fillExit(parentSignature, price) {
        const exit = this.exits.get(parentSignature);
        if (!exit || exit.status !== 'pending')
            return;
        exit.status = 'filled';
        exit.filledAt = Date.now();
        this.emit('exitFilled', exit);
    }
}
exports.ExitManager = ExitManager;
//# sourceMappingURL=exitManager.js.map