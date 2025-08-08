import { EventEmitter } from 'events';
export class ExitManager extends EventEmitter {
    orders = new Map();
    stopLossPct;
    takeProfitPct;
    timeoutMs;
    constructor({ stopLossPct = 0.1, takeProfitPct = 0.1, timeoutMs = 20000 } = {}) {
        super();
        this.stopLossPct = stopLossPct;
        this.takeProfitPct = takeProfitPct;
        this.timeoutMs = timeoutMs;
    }
    scheduleExit(address, entryPrice, timestamp) {
        const stopLoss = entryPrice * (1 - this.stopLossPct / 100);
        const takeProfit = entryPrice * (1 + this.takeProfitPct / 100);
        const order = { address, entryPrice, stopLoss, takeProfit, timestamp, active: true };
        this.orders.set(address, order);
        setTimeout(() => {
            if (order.active) {
                order.active = false;
                this.emit('exitTimeout', {
                    address,
                    reason: 'timeout',
                    entryPrice,
                    timestamp: Date.now(),
                });
            }
        }, this.timeoutMs);
    }
    onPriceUpdate(update) {
        const order = this.orders.get(update.address);
        console.log('[DEBUG ExitManager.onPriceUpdate]', {
            address: update.address,
            price: update.price,
            order,
        });
        if (!order || !order.active)
            return;
        if (update.price <= order.stopLoss) {
            order.active = false;
            this.emit('exitFilled', {
                address: update.address,
                exitType: 'stopLoss',
                exitPrice: update.price,
                entryPrice: order.entryPrice,
                timestamp: update.timestamp,
            });
        }
        else if (update.price >= order.takeProfit) {
            order.active = false;
            this.emit('exitFilled', {
                address: update.address,
                exitType: 'takeProfit',
                exitPrice: update.price,
                entryPrice: order.entryPrice,
                timestamp: update.timestamp,
            });
        }
    }
    getPendingExits() {
        return Array.from(this.orders.values()).filter((o) => o.active);
    }
}
//# sourceMappingURL=exitManager.js.map