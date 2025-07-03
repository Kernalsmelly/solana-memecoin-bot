"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderManager = void 0;
const events_1 = __importDefault(require("events"));
class OrderManager extends events_1.default {
    orders = new Map();
    connection;
    signer;
    pollInterval = 5000;
    poller;
    constructor(connection, signer) {
        super();
        this.connection = connection;
        this.signer = signer;
    }
    async placeOrder(tx) {
        const signature = await this.signer.signAndSendTransaction(tx, this.connection);
        const order = {
            signature,
            status: 'pending',
            tx,
            createdAt: Date.now(),
        };
        this.orders.set(signature, order);
        this.pollStatus(signature);
        return signature;
    }
    pollStatus(signature) {
        const poll = async () => {
            const order = this.orders.get(signature);
            if (!order || order.status !== 'pending')
                return;
            try {
                const statuses = await this.connection.getSignatureStatuses([signature]);
                const status = statuses.value[0];
                if (status && status.confirmationStatus === 'confirmed') {
                    order.status = 'confirmed';
                    order.filledAt = Date.now();
                    this.emit('orderFilled', order);
                }
                else if (status && status.err) {
                    order.status = 'failed';
                    order.error = JSON.stringify(status.err);
                    this.emit('orderFailed', order);
                }
                else {
                    // still pending
                    setTimeout(poll, this.pollInterval);
                }
            }
            catch (e) {
                setTimeout(poll, this.pollInterval);
            }
        };
        poll();
    }
    async cancelOrder(signature) {
        const order = this.orders.get(signature);
        if (!order || order.status !== 'pending')
            return;
        // No native cancel for swaps, but mark as cancelled for tracking
        order.status = 'cancelled';
        this.emit('orderCancelled', order);
    }
    getOrder(signature) {
        return this.orders.get(signature);
    }
}
exports.OrderManager = OrderManager;
//# sourceMappingURL=orderManager.js.map