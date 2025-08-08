import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Signer } from './signer.js';
import EventEmitter from 'events';
export interface Order {
    signature: string;
    status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'exited';
    tx: Transaction | VersionedTransaction;
    createdAt: number;
    filledAt?: number;
    error?: string;
}
export interface OrderManagerEvents {
    orderFilled: (order: Order) => void;
    orderFailed: (order: Order) => void;
    orderCancelled: (order: Order) => void;
}
export declare class OrderManager extends EventEmitter {
    private orders;
    private connection;
    private signer;
    private pollInterval;
    private poller?;
    constructor(connection: Connection, signer: Signer);
    placeOrder(tx: Transaction | VersionedTransaction): Promise<string>;
    private pollStatus;
    cancelOrder(signature: string): Promise<void>;
    /**
     * Attempts to exit a position by submitting an opposite swap (market order).
     * Emits ExitFilledEvent or ExitFailedEvent.
     */
    exitOrder(signature: string, exitType: 'stopLoss' | 'takeProfit'): Promise<void>;
    getOrder(signature: string): Order | undefined;
}
//# sourceMappingURL=orderManager.d.ts.map