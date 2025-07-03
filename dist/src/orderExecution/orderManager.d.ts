import { Connection, Transaction } from '@solana/web3.js';
import { Signer } from './signer';
import EventEmitter from 'events';
export interface Order {
    signature: string;
    status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
    tx: Transaction;
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
    placeOrder(tx: Transaction): Promise<string>;
    private pollStatus;
    cancelOrder(signature: string): Promise<void>;
    getOrder(signature: string): Order | undefined;
}
//# sourceMappingURL=orderManager.d.ts.map