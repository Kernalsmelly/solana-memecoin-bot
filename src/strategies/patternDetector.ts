import { EventEmitter } from 'events';
import { OHLCVEvent } from '../utils/priceFeedManager';

export interface PatternMatchEvent {
  address: string;
  timestamp: number;
  suggestedSOL: number;
  details?: any;
}

interface RollingWindow {
  prices: number[];
  volumes: number[];
  timestamps: number[];
}

export class PatternDetector extends EventEmitter {
  private windows: Map<string, RollingWindow> = new Map();
  private windowMs: number = 30 * 60 * 1000; // 30 minutes
  private smaWindowMs: number = 60 * 60 * 1000; // 1 hour

  handleOHLCV(event: OHLCVEvent) {
    const { address, close, volume, timestamp } = event;
    let win = this.windows.get(address);
    if (!win) {
      win = { prices: [], volumes: [], timestamps: [] };
      this.windows.set(address, win);
    }
    win.prices.push(close);
    win.volumes.push(volume);
    win.timestamps.push(timestamp);
    // Prune old data
    while (win.timestamps && win.timestamps.length > 0 && win.timestamps[0] !== undefined && timestamp - win.timestamps[0] > this.smaWindowMs) {
      win.prices.shift();
      win.volumes.shift();
      win.timestamps.shift();
    }
    // Check for squeeze
    this.checkSqueeze(address, win, timestamp);
  }

  private checkSqueeze(address: string, win: RollingWindow, now: number) {
    // Find indices for 30m and 1h windows
    let i30 = 0;
    while (win.timestamps && win.timestamps.length > 0 && i30 < win.timestamps.length) {
  const ts = win.timestamps[i30];
  if (ts === undefined || now - ts <= this.windowMs) break;
  i30++;
}
    let i60 = 0;
    while (win.timestamps && win.timestamps.length > 0 && i60 < win.timestamps.length) {
  const ts = win.timestamps[i60];
  if (ts === undefined || now - ts <= this.smaWindowMs) break;
  i60++;
}
    if (win.prices.length - i30 < 2) return; // not enough data
    const open = win.prices[i30];
    const close = win.prices[win.prices.length - 1];
    const vol30 = win.volumes.slice(i30).reduce((a, b) => a + b, 0);
    const vol60 = win.volumes.slice(i60).reduce((a, b) => a + b, 0);
    const n60 = win.volumes.length - i60;
    const sma1h = n60 > 0 ? vol60 / n60 : 0;
    if (open && close && sma1h) {
      if (close / open >= 1.2 && vol30 >= 2 * sma1h) {
        this.emit('patternMatch', {
          address,
          timestamp: now,
          suggestedSOL: 1,
          details: { open, close, vol30, sma1h }
        } as PatternMatchEvent);
      }
    }
  }
}
