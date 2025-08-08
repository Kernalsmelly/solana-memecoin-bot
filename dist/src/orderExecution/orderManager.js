import EventEmitter from 'events';
export class OrderManager extends EventEmitter {
    orders = new Map();
    connection;
    signer;
    pollInterval;
    poller;
    constructor(connection, signer) {
        super();
        this.connection = connection;
        this.signer = signer;
        // Use ORDER_STATUS_POLL_INTERVAL_MS, else POLLING_INTERVAL_SECONDS, else default 5000ms
        try {
            const { config } = require('../utils/config.js');
            this.pollInterval = config.trading?.orderStatusPollIntervalMs
                || (config.tokenMonitor?.pollingIntervalSeconds ? config.tokenMonitor.pollingIntervalSeconds * 1000 : undefined)
                || 5000;
        }
        catch (e) {
            this.pollInterval = 5000;
        }
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
        // Log [OrderSubmitted]
        // eslint-disable-next-line no-console
        console.log(`[OrderSubmitted] Signature: ${signature} Status: pending`);
        this.pollStatus(signature);
        return signature;
    }
    pollStatus(signature) {
        const poll = async () => {
            const order = this.orders.get(signature);
            if (!order || order.status !== 'pending')
                return;
            const pollTimestamp = new Date().toISOString();
            try {
                const statuses = await this.connection.getSignatureStatuses([signature]);
                const status = statuses.value[0];
                if (status && status.confirmationStatus === 'confirmed') {
                    order.status = 'confirmed';
                    order.filledAt = Date.now();
                    console.log(`[OrderConfirmedEvent] Signature: ${signature} Status: confirmed at ${pollTimestamp}`);
                    this.emit('orderFilled', order);
                }
                else if (status && status.err) {
                    order.status = 'failed';
                    order.error = JSON.stringify(status.err);
                    console.error(`[OrderFailedEvent] Signature: ${signature} Error: ${order.error} at ${pollTimestamp}`);
                    this.emit('orderFailed', order);
                }
                else {
                    // still pending
                    console.log(`[OrderPoll] Signature: ${signature} still pending at ${pollTimestamp} (next poll in ${this.pollInterval}ms)`);
                    setTimeout(poll, this.pollInterval);
                }
            }
            catch (e) {
                console.error(`[OrderPollError] Signature: ${signature} Error:`, e, `at ${pollTimestamp}`);
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
    /**
     * Attempts to exit a position by submitting an opposite swap (market order).
     * Emits ExitFilledEvent or ExitFailedEvent.
     */
    async exitOrder(signature, exitType) {
        const order = this.orders.get(signature);
        if (!order || order.status !== 'confirmed')
            return;
        try {
            // For swaps, exit = new swap in opposite direction
            // You must implement logic to determine the correct input/output mints and amount
            // For now, we log and emit a simulated event
            // TODO: Integrate with JupiterOrderExecution for real exit
            this.emit('ExitFilledEvent', {
                signature,
                exitType,
                timestamp: Date.now(),
                order,
            });
            order.status = 'exited';
        }
        catch (e) {
            this.emit('ExitFailedEvent', {
                signature,
                exitType,
                timestamp: Date.now(),
                order,
                error: e.message || e.toString(),
            });
        }
    }
    getOrder(signature) {
        return this.orders.get(signature);
    }
}
//# sourceMappingURL=orderManager.js.map