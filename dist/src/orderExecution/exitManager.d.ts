import { OrderManager, Order } from './orderManager.js';
import EventEmitter from 'events';
export interface ExitOrder {
    parentSignature: string;
    stopLossPrice: number;
    takeProfitPrice: number;
    status: 'pending' | 'filled' | 'timeout';
    filledAt?: number;
}
export interface ExitManagerEvents {
    exitFilled: (exit: ExitOrder) => void;
    exitTimeout: (exit: ExitOrder) => void;
}
export declare class ExitManager extends EventEmitter {
    private orderManager;
    private exits;
    private timeoutMs;
    constructor(orderManager: OrderManager, timeoutMs?: number);
    scheduleExit(parent: Order, entryPrice: number): void;
    private monitorExit;
    fillExit(parentSignature: string, price: number): void;
}
//# sourceMappingURL=exitManager.d.ts.map