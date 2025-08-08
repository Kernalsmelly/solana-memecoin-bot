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
    console.debug(
      `[Coordinator] enqueueToken: ${token} (active: ${Array.from(this.activeTokens)}, queue: ${this.queue}, cooldowns: ${Array.from(this.cooldowns)})`,
    );
    this.queue.push(token);
    this.tryDispatch();
  }

  /**
   * Call when a token's trade completes (to start cooldown)
   */
  completeToken(token: string) {
    const eligible = Date.now() + this.cooldownMs;
    this.cooldowns.set(token, eligible);
    this.activeTokens.delete(token);
    console.debug(
      `[Coordinator] completeToken: ${token} (active: ${Array.from(this.activeTokens)}, queue: ${this.queue}, cooldowns: ${Array.from(this.cooldowns.keys())})`,
    );
    setTimeout(() => {
      // Only remove if the eligible time has passed
      if (this.cooldowns.get(token) && Date.now() >= this.cooldowns.get(token)!) {
        this.cooldowns.delete(token);
        console.debug(
          `[Coordinator] cooldown expired: ${token} (active: ${Array.from(this.activeTokens)}, queue: ${this.queue}, cooldowns: ${Array.from(this.cooldowns.keys())})`,
        );
        this.tryDispatch();
      }
    }, this.cooldownMs);
    // Do not call tryDispatch here; only after cooldown expires
  }

  private isOnCooldown(token: string): boolean {
    if (!this.cooldowns.has(token)) return false;
    const eligible = this.cooldowns.get(token)!;
    return Date.now() < eligible;
  }

  private tryDispatch() {
    while (this.activeTokens.size < this.maxConcurrent && this.queue.length > 0) {
      const token = this.queue[0];
      if (!token) break;
      if (this.isOnCooldown(token) || this.activeTokens.has(token)) {
        // If the token at the front is not ready, break (don't cycle)
        break;
      }
      // Token is ready for dispatch
      this.queue.shift();
      this.activeTokens.add(token);
      console.debug(
        `[Coordinator] dispatching: ${token} (active: ${Array.from(this.activeTokens)}, queue: ${this.queue}, cooldowns: ${Array.from(this.cooldowns)})`,
      );
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
