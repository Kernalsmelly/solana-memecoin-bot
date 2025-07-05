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

export class ExitManager extends EventEmitter {
  private orders: Map<string, ExitOrder> = new Map();
  private stopLossPct: number;
  private takeProfitPct: number;
  private timeoutMs: number;

  constructor({ stopLossPct = 5, takeProfitPct = 10, timeoutMs = 12 * 60 * 60 * 1000 } = {}) {
    super();
    this.stopLossPct = stopLossPct;
    this.takeProfitPct = takeProfitPct;
    this.timeoutMs = timeoutMs;
  }

  scheduleExit(address: string, entryPrice: number, timestamp: number) {
    const stopLoss = entryPrice * (1 - this.stopLossPct / 100);
    const takeProfit = entryPrice * (1 + this.takeProfitPct / 100);
    const order: ExitOrder = { address, entryPrice, stopLoss, takeProfit, timestamp, active: true };
    this.orders.set(address, order);
    setTimeout(() => {
      if (order.active) {
        order.active = false;
        this.emit('exitTimeout', {
          address,
          reason: 'timeout',
          entryPrice,
          timestamp: Date.now(),
        } as ExitTimeoutEvent);
      }
    }, this.timeoutMs);
  }

  onPriceUpdate(update: PriceUpdate) {
    const order = this.orders.get(update.address);
    console.log('[DEBUG ExitManager.onPriceUpdate]', { address: update.address, price: update.price, order });
    if (!order || !order.active) return;
    if (update.price <= order.stopLoss) {
      order.active = false;
      this.emit('exitFilled', {
        address: update.address,
        exitType: 'stopLoss',
        exitPrice: update.price,
        entryPrice: order.entryPrice,
        timestamp: update.timestamp,
      } as ExitFilledEvent);
    } else if (update.price >= order.takeProfit) {
      order.active = false;
      this.emit('exitFilled', {
        address: update.address,
        exitType: 'takeProfit',
        exitPrice: update.price,
        entryPrice: order.entryPrice,
        timestamp: update.timestamp,
      } as ExitFilledEvent);
    }
  }

  getPendingExits() {
    return Array.from(this.orders.values()).filter(o => o.active);
  }
}
