import { OrderManager, Order } from './orderManager';
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

export class ExitManager extends EventEmitter {
  private orderManager: OrderManager;
  private exits: Map<string, ExitOrder> = new Map();
  private timeoutMs: number = 15 * 60 * 1000; // 15 min default

  constructor(orderManager: OrderManager, timeoutMs?: number) {
    super();
    this.orderManager = orderManager;
    if (timeoutMs) this.timeoutMs = timeoutMs;
  }

  scheduleExit(parent: Order, entryPrice: number) {
    const stopLoss = entryPrice * 0.98;
    const takeProfit = entryPrice * 1.02;
    const exit: ExitOrder = {
      parentSignature: parent.signature,
      stopLossPrice: stopLoss,
      takeProfitPrice: takeProfit,
      status: 'pending',
    };
    this.exits.set(parent.signature, exit);
    this.monitorExit(exit);
  }

  private monitorExit(exit: ExitOrder) {
    // In real system, poll price feed and trigger exit logic
    const check = async () => {
      // TODO: Integrate with price feed to check if stop-loss/take-profit hit
      // For now, simulate timeout
      setTimeout(() => {
        if (exit.status === 'pending') {
          exit.status = 'timeout';
          this.emit('exitTimeout', exit);
        }
      }, this.timeoutMs);
    };
    check();
  }

  fillExit(parentSignature: string, price: number) {
    const exit = this.exits.get(parentSignature);
    if (!exit || exit.status !== 'pending') return;
    exit.status = 'filled';
    exit.filledAt = Date.now();
    this.emit('exitFilled', exit);
  }
}
