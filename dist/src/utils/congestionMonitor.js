import EventEmitter from 'events';
export class CongestionMonitor extends EventEmitter {
    connection;
    thresholdMs;
    recentBlockTimes = [];
    lastSlot = 0;
    constructor(connection, thresholdMs = 800) {
        super();
        this.connection = connection;
        this.thresholdMs = thresholdMs;
    }
    start() {
        this.connection.onSlotChange(async (slotInfo) => {
            if (this.lastSlot === 0) {
                this.lastSlot = slotInfo.slot;
                return;
            }
            const now = Date.now();
            const blockTimeMs = now - this.lastSlot;
            this.recentBlockTimes.push(blockTimeMs);
            if (this.recentBlockTimes.length > 50)
                this.recentBlockTimes.shift();
            this.lastSlot = now;
            // Calculate 95th percentile
            const sorted = [...this.recentBlockTimes].sort((a, b) => a - b);
            const p95 = sorted[Math.floor(0.95 * sorted.length)];
            if (typeof p95 === 'number' && p95 > this.thresholdMs) {
                this.emit('congestion', {
                    blockTimeMs: p95,
                    slot: slotInfo.slot,
                    threshold: this.thresholdMs,
                });
            }
        });
    }
}
//# sourceMappingURL=congestionMonitor.js.map