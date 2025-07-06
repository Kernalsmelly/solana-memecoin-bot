"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyCoordinator = void 0;
const events_1 = __importDefault(require("events"));
class StrategyCoordinator extends events_1.default {
    strategies;
    cooldowns; // tokenSymbol => timestamp
    enabled;
    defaultCooldownSec;
    constructor(options) {
        super();
        this.strategies = new Map();
        (options.strategies || []).forEach(s => this.strategies.set(s.name, s));
        this.enabled = new Set(options.enabledStrategies || process.env.ENABLED_STRATEGIES?.split(',') || [...this.strategies.keys()]);
        this.cooldowns = new Map();
        this.defaultCooldownSec = options.cooldownSec || 300;
    }
    enableStrategy(name, enabled) {
        if (enabled)
            this.enabled.add(name);
        else
            this.enabled.delete(name);
    }
    getEnabledStrategies() {
        return Array.from(this.enabled);
    }
    /**
     * Called on every new OHLCV event. Schedules enabled strategies in order.
     */
    async handleOHLCV(event) {
        const token = event.tokenSymbol || event.address;
        const now = Date.now() / 1000;
        if (this.cooldowns.get(token) && now < this.cooldowns.get(token))
            return;
        for (const name of this.enabled) {
            const strat = this.strategies.get(name);
            if (!strat)
                continue;
            await strat.handleOHLCV(event);
            // If a strategy triggers, set cooldown for this token
            // (Assume strategies emit 'patternMatch' on this coordinator)
            this.cooldowns.set(token, now + (strat.cooldownSec || this.defaultCooldownSec));
            break;
        }
    }
}
exports.StrategyCoordinator = StrategyCoordinator;
exports.default = StrategyCoordinator;
//# sourceMappingURL=strategyCoordinator.js.map