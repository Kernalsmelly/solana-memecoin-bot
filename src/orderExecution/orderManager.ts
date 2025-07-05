import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Signer, AnySolanaTx } from './signer';
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

  async placeOrder(tx: Transaction | VersionedTransaction): Promise<string> {
    const signature = await this.signer.signAndSendTransaction(tx, this.connection);
    const order: Order = {
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
          // Log [OrderConfirmedEvent]
          // eslint-disable-next-line no-console
          console.log(`[OrderConfirmedEvent] Signature: ${signature} Status: confirmed`);
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

  /**
   * Attempts to exit a position by submitting an opposite swap (market order).
   * Emits ExitFilledEvent or ExitFailedEvent.
   */
  async exitOrder(signature: string, exitType: 'stopLoss' | 'takeProfit') {
    const order = this.orders.get(signature);
    if (!order || order.status !== 'confirmed') return;
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
    } catch (e: any) {
      this.emit('ExitFailedEvent', {
        signature,
        exitType,
        timestamp: Date.now(),
        order,
        error: e.message || e.toString(),
      });
    }
  }

  getOrder(signature: string): Order | undefined {
    return this.orders.get(signature);
  }
}
