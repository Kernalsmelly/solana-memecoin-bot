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
  private pumpDumpWindowMs: number = 12 * 60 * 60 * 1000; // 12 hours

  handleOHLCV(event: OHLCVEvent & { buyRatio?: number }) {
    const { address, close, volume, timestamp, buyRatio } = event;
    let win = this.windows.get(address);
    if (!win) {
      win = { prices: [], volumes: [], timestamps: [] };
      this.windows.set(address, win);
    }
    win.prices.push(close);
    win.volumes.push(volume);
    win.timestamps.push(timestamp);
    if (buyRatio !== undefined) {
      (win as any).buyRatio = buyRatio;
    }
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
    // Find indices for 30m, 1h, and 12h windows
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
    let i12h = 0;
    while (win.timestamps && win.timestamps.length > 0 && i12h < win.timestamps.length) {
      const ts = win.timestamps[i12h];
      if (ts === undefined || now - ts <= this.pumpDumpWindowMs) break;
      i12h++;
    }
    if (win.prices.length - i30 < 2) return; // not enough data
    const open = win.prices[i30];
    const close = win.prices[win.prices.length - 1];
    const vol30 = win.volumes.slice(i30).reduce((a, b) => a + b, 0);
    const vol60 = win.volumes.slice(i60).reduce((a, b) => a + b, 0);
    const n60 = win.volumes.length - i60;
    const sma1h = n60 > 0 ? vol60 / n60 : 0;

    // --- Mega Pump & Dump ---
    if (win.prices.length - i12h >= 2) {
      const open12h = win.prices[i12h];
      const close12h = win.prices[win.prices.length - 1];
      const vol12h = win.volumes.slice(i12h).reduce((a, b) => a + b, 0);
      const n12h = win.volumes.length - i12h;
      const sma12h = n12h > 0 ? vol12h / n12h : 0;
      const priceDelta12h = (close12h - open12h) / open12h * 100;
      if (priceDelta12h >= 40 && vol12h >= 1.7 * sma12h) {
        this.emit('patternMatch', {
          address,
          timestamp: now,
          strategy: 'pumpDump',
          suggestedSOL: 1,
          details: { open12h, close12h, vol12h, sma12h, priceDelta12h }
        } as PatternMatchEvent);
      }
    }

    // --- Smart Money Trap ---
    // For demo, assume buyRatio is available in win.details or elsewhere (should be part of OHLCVEvent in real use)
    const buyRatio = (win as any).buyRatio || 2; // Replace with real calculation or pass in event
    const priceDelta = (close - open) / open * 100;
    // Debug log
    console.log('[DEBUG SmartTrap]', {
      open, close, priceDelta, vol60, sma1h, buyRatio,
      cond_price: priceDelta >= 15,
      cond_vol: vol60 >= 0.8 * sma1h,
      cond_buy: buyRatio >= 1.8
    });
    if (priceDelta >= 15 && vol60 >= 0.8 * sma1h && buyRatio >= 1.8) {
      this.emit('patternMatch', {
        address,
        timestamp: now,
        strategy: 'smartTrap',
        suggestedSOL: 1,
        details: { open, close, vol60, sma1h, priceDelta, buyRatio }
      } as PatternMatchEvent);
    }

    // --- Existing Squeeze Pattern ---
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

