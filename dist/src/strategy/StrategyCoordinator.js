"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyCoordinator = void 0;
const events_1 = __importDefault(require("events"));
/**
 * Coordinates execution of strategies across multiple tokens with concurrency and cooldowns.
 */
class StrategyCoordinator extends events_1.default {
    maxConcurrent;
    cooldownMs;
    activeTokens = new Set();
    cooldowns = new Map();
    queue = [];
    constructor(options) {
        super();
        this.maxConcurrent = options.maxConcurrent;
        this.cooldownMs = options.cooldownMs;
    }
    /**
     * Call when a new token is discovered or signaled for trading
     */
    enqueueToken(token) {
        // Prevent enqueue if token is active, queued, or on cooldown
        if (this.activeTokens.has(token) || this.queue.includes(token))
            return;
        if (this.isOnCooldown(token))
            return; // Do NOT queue if on cooldown
        this.queue.push(token);
        this.tryDispatch();
    }
    /**
     * Call when a token's trade completes (to start cooldown)
     */
    completeToken(token) {
        this.activeTokens.delete(token);
        this.cooldowns.set(token, Date.now());
        setTimeout(() => {
            this.cooldowns.delete(token);
            this.tryDispatch();
        }, this.cooldownMs);
        this.tryDispatch();
    }
    isOnCooldown(token) {
        if (!this.cooldowns.has(token))
            return false;
        const since = Date.now() - this.cooldowns.get(token);
        return since < this.cooldownMs;
    }
    tryDispatch() {
        while (this.activeTokens.size < this.maxConcurrent && this.queue.length > 0) {
            const token = this.queue.shift();
            if (this.isOnCooldown(token) || this.activeTokens.has(token))
                continue;
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
exports.StrategyCoordinator = StrategyCoordinator;
//# sourceMappingURL=StrategyCoordinator.js.map