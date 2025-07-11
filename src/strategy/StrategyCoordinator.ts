import EventEmitter from 'events';

export interface StrategyCoordinatorOptions {
  maxConcurrent: number;
  cooldownMs: number;
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
    // Prevent enqueue if token is active, queued, or on cooldown
    if (this.activeTokens.has(token) || this.queue.includes(token)) return;
    if (this.isOnCooldown(token)) return; // Do NOT queue if on cooldown
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
      const token = this.queue.shift()!;
      if (this.isOnCooldown(token) || this.activeTokens.has(token)) continue;
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
