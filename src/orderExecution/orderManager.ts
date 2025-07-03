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

export class OrderManager extends EventEmitter {
  private orders: Map<string, Order> = new Map();
  private connection: Connection;
  private signer: Signer;
  private pollInterval: number = 5000;
  private poller?: NodeJS.Timeout;

  constructor(connection: Connection, signer: Signer) {
    super();
    this.connection = connection;
    this.signer = signer;
  }

  async placeOrder(tx: Transaction): Promise<string> {
    const signature = await this.signer.signAndSendTransaction(tx, this.connection);
    const order: Order = {
      signature,
      status: 'pending',
      tx,
      createdAt: Date.now(),
    };
    this.orders.set(signature, order);
    this.pollStatus(signature);
    return signature;
  }

  private pollStatus(signature: string) {
    const poll = async () => {
      const order = this.orders.get(signature);
      if (!order || order.status !== 'pending') return;
      try {
        const statuses = await this.connection.getSignatureStatuses([signature]);
        const status = statuses.value[0];
        if (status && status.confirmationStatus === 'confirmed') {
          order.status = 'confirmed';
          order.filledAt = Date.now();
          this.emit('orderFilled', order);
        } else if (status && status.err) {
          order.status = 'failed';
          order.error = JSON.stringify(status.err);
          this.emit('orderFailed', order);
        } else {
          // still pending
          setTimeout(poll, this.pollInterval);
        }
      } catch (e) {
        setTimeout(poll, this.pollInterval);
      }
    };
    poll();
  }

  async cancelOrder(signature: string) {
    const order = this.orders.get(signature);
    if (!order || order.status !== 'pending') return;
    // No native cancel for swaps, but mark as cancelled for tracking
    order.status = 'cancelled';
    this.emit('orderCancelled', order);
  }

  getOrder(signature: string): Order | undefined {
    return this.orders.get(signature);
  }
}
