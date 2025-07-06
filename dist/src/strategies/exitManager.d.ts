import { EventEmitter } from 'events';
export interface ExitOrder {
    address: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    timestamp: number;
    active: boolean;
}
export interface ExitFilledEvent {
    address: string;
    exitType: 'stopLoss' | 'takeProfit';
    exitPrice: number;
    entryPrice: number;
    timestamp: number;
}
export interface ExitTimeoutEvent {
    address: string;
    reason: string;
    entryPrice: number;
    timestamp: number;
}
export interface PriceUpdate {
    address: string;
    price: number;
    timestamp: number;
}
export declare class ExitManager extends EventEmitter {
    private orders;
    private stopLossPct;
    private takeProfitPct;
    private timeoutMs;
    constructor({ stopLossPct, takeProfitPct, timeoutMs }?: {
        stopLossPct?: number | undefined;
        takeProfitPct?: number | undefined;
        timeoutMs?: number | undefined;
    });
    scheduleExit(address: string, entryPrice: number, timestamp: number): void;
    onPriceUpdate(update: PriceUpdate): void;
    getPendingExits(): ExitOrder[];
}
//# sourceMappingURL=exitManager.d.ts.map