import EventEmitter from 'events';

export interface Strategy {
  name: string;
  execute: (token: string) => Promise<void>;
}

export interface StrategyCoordinatorOptions {
  maxConcurrent: number;
  cooldownMs: number;
  strategies: Strategy[];
}

/**
 * Coordinates execution of strategies across multiple tokens with concurrency and cooldowns.
 */
export class StrategyCoordinator extends EventEmitter {
  private maxConcurrent: number;
  private cooldownMs: number;
  private activeTokens: Set<string> = new Set();
  private cooldowns: Map<string, number> = new Map();
  private queue: string[] = [];

  constructor(options: StrategyCoordinatorOptions) {
    super();
    this.maxConcurrent = options.maxConcurrent;
    this.cooldownMs = options.cooldownMs;
  }

  /**
   * Call when a new token is discovered or signaled for trading
   */
  enqueueToken(token: string) {
    // Prevent enqueue if token is active or already queued
    if (this.activeTokens.has(token) || this.queue.includes(token)) return;
    // If on cooldown, do not enqueue
    if (this.isOnCooldown(token)) return;
    this.queue.push(token);
    this.tryDispatch();
  }

  /**
   * Call when a token's trade completes (to start cooldown)
   */
  completeToken(token: string) {
    this.activeTokens.delete(token);
    this.cooldowns.set(token, Date.now());
    setTimeout(() => {
      this.cooldowns.delete(token);
      this.tryDispatch();
    }, this.cooldownMs);
    this.tryDispatch();
  }

  private isOnCooldown(token: string): boolean {
    if (!this.cooldowns.has(token)) return false;
    const since = Date.now() - this.cooldowns.get(token)!;
    return since < this.cooldownMs;
  }

  private tryDispatch() {
    while (this.activeTokens.size < this.maxConcurrent && this.queue.length > 0) {
      const token = this.queue[0];
      if (this.isOnCooldown(token) || this.activeTokens.has(token)) {
        // If the token at the front is not ready, break (don't cycle)
        break;
      }
      // Token is ready for dispatch
      this.queue.shift();
      this.activeTokens.add(token);
      this.emit('tokenDispatch', token);
    }
  }

  /**
   * For testing: get current queue and active tokens
   */
  getStatus() {
    return {
      active: Array.from(this.activeTokens),
      queue: [...this.queue],
      cooldowns: Array.from(this.cooldowns.keys()),
    };
  }
}
