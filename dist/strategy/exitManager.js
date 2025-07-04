"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitManager = void 0;
const events_1 = require("events");
const logger_1 = __importDefault(require("../utils/logger"));
const tradeLogger_1 = require("../utils/tradeLogger");
const notifications_1 = require("../utils/notifications"); // Keep AlertLevel import for type annotation
// Basic deep merge utility
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}
function deepMerge(target, source) {
    let output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            const targetValue = target[key];
            const sourceValue = source[key];
            if (isObject(targetValue) && isObject(sourceValue)) {
                output[key] = deepMerge(targetValue, sourceValue);
            }
            else {
                output[key] = sourceValue;
            }
        });
    }
    return output;
}
/**
 * Advanced Exit Strategy Manager
 * Handles position exits based on sophisticated rules including:
 * - Time-based exits
 * - Profit targets
 * - Stop losses
 * - Trailing stops
 * - Volatility-based exits
 * - Pattern-specific exit rules
 */
class ExitManager extends events_1.EventEmitter {
    positions = new Map(); // Use ManagedPosition
    config;
    orderExecution;
    riskManager;
    birdeyeApi; // Add BirdeyeAPI instance
    priceUpdateInterval = null;
    analysisInterval = null;
    // Quick cache for last N prices for volatility calculation
    priceHistory = new Map(); // Explicit typing. Key should be tokenAddress
    constructor(orderExecution, riskManager, birdeyeApi, config) {
        super();
        this.orderExecution = orderExecution;
        this.riskManager = riskManager;
        this.birdeyeApi = birdeyeApi; // Store the instance
        // Default configuration
        this.config = {
            timeBasedExits: {
                maxHoldingTimeHours: 24,
                quickProfitMinutes: 15,
                quickProfitThreshold: 10 // 10% profit in 15 minutes = exit
            },
            profitExits: {
                takeProfit: 30, // 30% profit target
                megaProfitExit: { threshold: 50, lockInPercent: 40 }, // Example: Activate at 50%, lock in 40%
                superProfitExit: 150 // 150% = super profit exit
            },
            lossExits: {
                stopLoss: -10, // 10% stop loss
                timeBasedStopAdjustment: { afterMinutes: 60, newStopPercent: -5 } // Tighten stop after 1 hour
            },
            trailingStops: {
                enabled: true,
                activationThreshold: 15, // start trailing at 15% profit
                trailPercent: 10 // trail by 10% of peak price
            },
            volatilityExits: {
                enabled: true,
                lookbackPeriods: 10,
                stdDevMultiplier: 2.5
            },
            patternSpecificRules: {},
        };
        // Apply custom config if provided
        if (config) {
            this.config = deepMerge(this.config, config); // Use deep merge
        }
        logger_1.default.info('Exit Manager initialized', {
            patternRules: Object.keys(this.config.patternSpecificRules)
        });
    }
    /**
     * Start monitoring positions for exit signals
     */
    start() {
        // Update prices every 10 seconds
        this.priceUpdateInterval = setInterval(() => {
            this.updatePositionPrices();
        }, 10000);
        // Analyze for exit signals every 30 seconds
        this.analysisInterval = setInterval(() => {
            this.analyzePositionsForExits();
        }, 30000);
        logger_1.default.info('Exit Manager started');
    }
    /**
     * Stop monitoring positions
     */
    stop() {
        if (this.priceUpdateInterval) {
            clearInterval(this.priceUpdateInterval);
            this.priceUpdateInterval = null;
        }
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        logger_1.default.info('Exit Manager stopped');
    }
    /**
     * Track a new position
     */
    addPosition(position) {
        this.positions.set(position.id, position); // Use id from ManagedPosition
        // Initialize price history for this token
        this.priceHistory.set(position.tokenAddress, [position.entryPrice]); // Use tokenAddress as key
        // Set initial stop loss and take profit based on rules
        const updatedPosition = this.applyExitRules(position); // applyExitRules now uses/returns ManagedPosition
        this.positions.set(position.id, updatedPosition); // Use id from ManagedPosition
        logger_1.default.info('Position added to Exit Manager', {
            id: updatedPosition.id, // Use id from ManagedPosition
            token: updatedPosition.tokenSymbol || updatedPosition.tokenAddress, // Use base Position fields
            pattern: updatedPosition.pattern, // Use pattern from ManagedPosition
            stopLoss: updatedPosition.stopLoss,
            takeProfit: updatedPosition.takeProfit
        });
        // Emit event
        this.emit('positionAdded', updatedPosition);
    }
    /**
     * Remove a tracked position
     */
    removePosition(positionId) {
        const position = this.positions.get(positionId);
        if (position) { // Check existence before deleting
            this.positions.delete(positionId);
            this.priceHistory.delete(position.tokenAddress); // Use tokenAddress as key
            logger_1.default.info('Position removed from Exit Manager', { id: positionId });
            this.emit('positionRemoved', positionId);
        }
    }
    /**
     * Get all currently tracked positions
     */
    getPositions() {
        return Array.from(this.positions.values());
    }
    /**
     * Update exit rules for a specific position
     */
    updatePositionExitRules(positionId, updates) {
        const position = this.positions.get(positionId);
        if (!position) {
            return null;
        }
        // Ensure updates includes potential trailingStop changes if needed
        const updatedPosition = { ...position, ...updates }; // Type assertion
        this.positions.set(positionId, updatedPosition);
        logger_1.default.info('Position exit rules updated', {
            id: positionId,
            updates: {
                stopLoss: updates.stopLoss,
                takeProfit: updates.takeProfit,
                trailingStop: updates.trailingStop // Access trailingStop directly from updates
            }
        });
        return updatedPosition;
    }
    /**
     * Manual exit for a position
     */
    async exitPosition(positionId, reason) {
        const position = this.positions.get(positionId); // position is ManagedPosition | undefined
        if (!position) {
            logger_1.default.warn('Cannot exit position: not found', { id: positionId });
            return false;
        }
        try {
            const result = await this.executeExit(position, reason); // executeExit takes ManagedPosition
            if (result) {
                this.removePosition(positionId);
            }
            return result;
        }
        catch (error) {
            logger_1.default.error('Error during position exit', {
                positionId: positionId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }
    /**
     * Update prices for all tracked positions
     */
    async updatePositionPrices() {
        logger_1.default.debug('Updating position prices...');
        const pricePromises = [];
        const openPositions = Array.from(this.positions.values()).filter(p => p.status === 'open');
        if (openPositions.length === 0) {
            logger_1.default.debug('No open positions to update prices for.');
            return;
        }
        for (const position of openPositions) {
            if (position.status === 'open') {
                pricePromises.push(this._fetchPrice(position.tokenAddress)
                    .then(price => {
                    if (price !== null) {
                        // Update price history for this token
                        let history = this.priceHistory.get(position.tokenAddress) || []; // Use tokenAddress as key
                        history.push(price);
                        // Keep only the last N prices (N = lookbackPeriods)
                        if (history.length > this.config.volatilityExits.lookbackPeriods) {
                            history = history.slice(-this.config.volatilityExits.lookbackPeriods);
                        }
                        this.priceHistory.set(position.tokenAddress, history); // Use tokenAddress as key
                        // Update position object directly in the map
                        const currentPosition = this.positions.get(position.id);
                        if (currentPosition) {
                            currentPosition.currentPrice = price;
                            currentPosition.timestamp = Date.now(); // Update timestamp
                            // Re-integrate trailing stop update logic here
                            if (this.config.trailingStops.enabled && currentPosition.trailingStop) {
                                const trailingStop = currentPosition.trailingStop;
                                if (price > trailingStop.highestPrice) {
                                    trailingStop.highestPrice = price;
                                    trailingStop.stopPrice = price * (1 - trailingStop.percent / 100);
                                    logger_1.default.info(`[ExitManager] Emergency stop reset by user or system.`);
                                    tradeLogger_1.tradeLogger.logScenario('EMERGENCY_STOP_RESET', {
                                        event: 'emergencyStopReset',
                                        details: 'Emergency stop successfully reset',
                                        timestamp: new Date().toISOString()
                                    });
                                    logger_1.default.warn(`[ExitManager] Forced exit triggered for ${position.tokenSymbol}`);
                                    tradeLogger_1.tradeLogger.logScenario('FORCED_EXIT', {
                                        event: 'forcedExit',
                                        token: position.tokenSymbol,
                                        reason: 'forced exit',
                                        timestamp: new Date().toISOString()
                                    });
                                    logger_1.default.debug(`Trailing stop updated for ${currentPosition.tokenSymbol || position.id}`, { newStopPrice: trailingStop.stopPrice });
                                }
                            }
                        }
                    }
                }));
            }
        }
        try {
            await Promise.all(pricePromises);
            logger_1.default.info(`Finished price updates for ${openPositions.length} open positions.`);
        }
        catch (error) {
            logger_1.default.error('Error occurred during batch price update processing', { error });
        }
    }
    /**
     * Fetches the current price for a token using BirdeyeAPI.
     * Includes basic error handling and logging.
     */
    async _fetchPrice(tokenAddress) {
        try {
            // Corrected method name based on lint feedback
            if (!this.birdeyeApi) {
                logger_1.default.warn(`BirdeyeAPI is not available. Cannot fetch price for ${tokenAddress}`);
                return null;
            }
            const priceObj = await this.birdeyeApi.getTokenPrice(tokenAddress);
            const price = priceObj?.priceUsd;
            if (typeof price !== 'number' || isNaN(price)) {
                logger_1.default.warn(`Received invalid price for ${tokenAddress}`, { price });
                return null;
            }
            return price;
        }
        catch (error) {
            logger_1.default.error(`Failed to fetch price for ${tokenAddress} from BirdeyeAPI`, { error });
            return null;
        }
    }
    /**
     * Analyze all positions for exit signals
     */
    async analyzePositionsForExits() {
        for (const position of this.positions.values()) { // position is ManagedPosition
            try {
                const exitReason = this.checkProfitLossRules(position) ||
                    this.checkTrailingStop(position) ||
                    this.checkTimeBasedRules(position) ||
                    this.checkVolatilityRules(position);
                if (exitReason) {
                    logger_1.default.info('Exit signal detected', {
                        positionId: position.id,
                        token: position.tokenSymbol || position.tokenAddress,
                        reason: exitReason,
                        signal: exitReason
                    });
                    // Execute exit
                    const success = await this.executeExit(position, exitReason);
                    if (success) {
                        this.removePosition(position.id);
                    }
                }
            }
            catch (error) {
                logger_1.default.error('Error analyzing position for exits', {
                    positionId: position.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    }
    /**
     * Check profit/loss targets and stop loss
     * @returns Exit reason string if triggered, null otherwise
     */
    checkProfitLossRules(position) {
        // Ensure currentPrice is available
        if (typeof position.currentPrice !== 'number') {
            logger_1.default.warn('Skipping P/L check due to missing currentPrice', { id: position.id });
            return null;
        }
        // Use specific rules if defined for the pattern
        const patternRules = this.config.patternSpecificRules[position.pattern] || []; // Use pattern from ManagedPosition
        // TODO: Consider if pattern rules should define price levels or percentages
        // const profitTargetRule = patternRules.find(r => r.type === 'profit');
        // const lossTargetRule = patternRules.find(r => r.type === 'loss');
        // Check take profit (comparing current price to target price level)
        if (position.takeProfit && position.currentPrice >= position.takeProfit) {
            return `Take Profit hit at price ${position.takeProfit.toFixed(6)}`; // Reference the price level
        }
        // Check stop loss (comparing current price to target price level)
        if (position.stopLoss && position.currentPrice <= position.stopLoss) {
            return `Stop Loss hit at price ${position.stopLoss.toFixed(6)}`; // Reference the price level
        }
        return null;
    }
    /**
     * Check trailing stop loss
     * @returns Exit reason string if triggered, null otherwise
     */
    checkTrailingStop(position) {
        if (!this.config.trailingStops.enabled || !position.trailingStop) { // Access trailingStop from ManagedPosition
            return null;
        }
        const { highestPrice, stopPrice } = position.trailingStop;
        // Update highest price if current price is higher
        let newHighestPrice = highestPrice;
        let newStopPrice = stopPrice;
        let updated = false;
        if (position.currentPrice > highestPrice) {
            newHighestPrice = position.currentPrice;
            newStopPrice = position.currentPrice * (1 - position.trailingStop.percent / 100);
            // Update the position in the map directly
            const updatedPosition = { ...position, trailingStop: { ...position.trailingStop, highestPrice: newHighestPrice, stopPrice: newStopPrice } };
            this.positions.set(position.id, updatedPosition);
            updated = true;
            logger_1.default.debug('Trailing stop adjusted upwards', { id: position.id, newStop: newStopPrice.toFixed(6) });
        }
        // Check if current price hits the stop price
        if (position.currentPrice <= newStopPrice) {
            return `Trailing Stop (${position.trailingStop.percent}%) hit at ${newStopPrice.toFixed(6)}`;
        }
        return null;
    }
    /**
     * Check time-based exit rules
     * @returns Exit reason string if triggered, null otherwise
     */
    checkTimeBasedRules(position) {
        // Use specific rules if defined for the pattern
        const patternRules = this.config.patternSpecificRules[position.pattern] || []; // Use pattern from ManagedPosition
        const timeRule = patternRules.find(r => r.type === 'time');
        // Configurable times
        const maxHoldingTimeHours = timeRule ? timeRule.value : this.config.timeBasedExits.maxHoldingTimeHours;
        // Check max holding time
        const holdingTimeMs = Date.now() - position.entryTime; // Use entryTime from ManagedPosition
        const holdingTimeHours = holdingTimeMs / (1000 * 60 * 60);
        if (holdingTimeHours >= maxHoldingTimeHours) {
            return `Max Holding Time (${maxHoldingTimeHours}h)`;
        }
        return null;
    }
    /**
     * Check volatility-based exit rules
     * @returns Exit reason string if triggered, null otherwise
     */
    checkVolatilityRules(position) {
        if (!this.config.volatilityExits.enabled)
            return null;
        // Use specific rules if defined for the pattern
        const patternRules = this.config.patternSpecificRules[position.pattern] || []; // Use pattern from ManagedPosition
        const volatilityRule = patternRules.find(r => r.type === 'volatility');
        const lookback = volatilityRule ? volatilityRule.value : this.config.volatilityExits.lookbackPeriods;
        const stdDevMult = volatilityRule ? volatilityRule.multiplier || this.config.volatilityExits.stdDevMultiplier : this.config.volatilityExits.stdDevMultiplier;
        // Get price history for the token
        const prices = this.priceHistory.get(position.tokenAddress); // Use tokenAddress as key
        // Need at least 2 prices for return calculation and enough for lookback
        if (!prices || prices.length < 2 || prices.length < lookback) {
            return null; // Not enough data
        }
        // Ensure current price is valid before proceeding
        if (typeof position.currentPrice !== 'number') {
            logger_1.default.warn('Skipping volatility check due to missing current price', { id: position.id });
            return null;
        }
        // Calculate historical volatility
        const returns = []; // Explicitly type as number[]
        // Ensure we only iterate over valid indices
        for (let i = Math.max(1, prices.length - lookback + 1); i < prices.length; i++) {
            // Explicitly check previous price existence and type before calculation
            const prevPrice = prices[i - 1];
            const currentPriceAtIndex = prices[i]; // Check current price at index i too
            if (typeof prevPrice === 'number') {
                if (typeof currentPriceAtIndex === 'number') {
                    const returnPct = (currentPriceAtIndex - prevPrice) / prevPrice;
                    returns.push(returnPct);
                }
                else {
                    logger_1.default.warn(`Skipping return calculation due to invalid current price at index ${i}`, { id: position.id });
                }
            }
            else {
                logger_1.default.warn(`Skipping return calculation due to invalid previous price at index ${i - 1}`, { id: position.id });
            }
        }
        if (returns.length === 0)
            return null; // No returns calculated
        // Calculate standard deviation of returns
        const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
        const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        // Check if current return exceeds volatility threshold
        // Safely access the second to last price
        const previousPrice = prices[prices.length - 2];
        // Added check for currentPrice validity above
        // Explicitly check previousPrice before using it
        if (typeof previousPrice !== 'number') {
            logger_1.default.warn('Skipping volatility return check due to missing previous price', { id: position.id });
            return null;
        }
        const currentReturn = (position.currentPrice - previousPrice) / previousPrice;
        const volatilityThreshold = stdDev * stdDevMult;
        if (Math.abs(Number(currentReturn)) > Number(volatilityThreshold)) { // Explicitly cast to Number
            // Only exit on negative volatility spikes if we're in profit
            // or if the volatility is extreme
            const pnlPercent = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
            if (currentReturn < 0 && (pnlPercent > 5 || Math.abs(currentReturn) > volatilityThreshold * 1.5)) {
                return `Volatility Spike (${(currentReturn * 100).toFixed(2)}%, threshold: ${(volatilityThreshold * 100).toFixed(2)}%)`;
            }
        }
        return null;
    }
    /**
     * Calculate standard deviation
     */
    calculateStdDev(data) {
        if (data.length < 2)
            return 0;
        const n = data.length;
        const mean = data.reduce((sum, val) => sum + val, 0) / n;
        const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1); // Use sample variance
        return Math.sqrt(variance);
    }
    /**
     * Apply default and pattern-specific rules to set initial SL/TP/Trailing
     * Also activates trailing stop if conditions are met.
     */
    applyExitRules(position) {
        let updatedPosition = { ...position }; // Ensure type
        // Use specific rules if defined for the pattern
        const patternRules = this.config.patternSpecificRules[position.pattern] || []; // Use pattern from ManagedPosition
        // Get potential pattern specific SL/TP/Trailing % overrides
        const patternStopLossRule = patternRules.find(r => r.type === 'loss');
        const patternTakeProfitRule = patternRules.find(r => r.type === 'profit');
        const patternTrailingRule = patternRules.find(r => r.type === 'trailing');
        // Set initial Stop Loss (as a price level)
        const stopLossPercent = patternStopLossRule ? patternStopLossRule.value : this.config.lossExits.stopLoss;
        updatedPosition.stopLoss = position.entryPrice * (1 + stopLossPercent / 100); // stopLoss exists on base Position
        // Set initial Take Profit (as a price level)
        const takeProfitPercent = patternTakeProfitRule ? patternTakeProfitRule.value : this.config.profitExits.takeProfit;
        updatedPosition.takeProfit = position.entryPrice * (1 + takeProfitPercent / 100); // takeProfit exists on base Position
        // Initialize trailing stop state if enabled and activation threshold met
        const trailActivationPercent = patternTrailingRule ? patternTrailingRule.activation || this.config.trailingStops.activationThreshold : this.config.trailingStops.activationThreshold;
        const trailPercent = patternTrailingRule ? patternTrailingRule.value : this.config.trailingStops.trailPercent;
        const currentProfitPercent = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
        if (this.config.trailingStops.enabled &&
            !updatedPosition.trailingStop && // Check trailingStop on ManagedPosition
            currentProfitPercent >= trailActivationPercent) {
            const stopPrice = position.currentPrice * (1 - trailPercent / 100);
            updatedPosition.trailingStop = {
                percent: trailPercent,
                highestPrice: position.currentPrice,
                stopPrice: stopPrice
            };
            logger_1.default.debug('Trailing stop activated on position add', { id: position.id, stopPrice }); // Use id from ManagedPosition
        }
        return updatedPosition;
    }
    /**
     * Execute the actual exit order
     * @returns True if exit was successful, false otherwise
     */
    async executeExit(position, reason) {
        logger_1.default.info('Attempting to execute exit', {
            id: position.id, // Use id from ManagedPosition
            token: position.tokenSymbol || position.tokenAddress, // Use base Position fields
            reason: reason
        });
        try {
            // Construct TradeOrder compatible with LiveOrderExecution
            const sellOrder = {
                tokenAddress: position.tokenAddress,
                side: 'sell',
                size: position.quantity,
                price: position.currentPrice
            };
            const result = await this.orderExecution.executeOrder(sellOrder);
            if (result.success) {
                // Calculate actual PNL if possible
                let actualSolReceived = typeof result.inputAmount === 'number'
                    ? BigInt(result.inputAmount)
                    : result.inputAmount; // SOL received from sell
                let initialSolCost = position.initialSolCostLamports;
                // Use currentPrice for notification as a fallback or if SOL amounts missing
                this.notifyExit(position, reason, position.currentPrice, actualSolReceived, initialSolCost);
                this.emit('positionClosed', { position, reason });
                return true;
            }
            else {
                logger_1.default.error('Failed to execute exit order', { id: position.id, error: result.error }); // Use id from ManagedPosition
                await (0, notifications_1.sendAlert)(`🚨 Failed to exit position ${position.tokenSymbol || position.tokenAddress}! Reason: ${result.error}`, 'CRITICAL'); // Use string literal
                return false;
            }
        }
        catch (error) {
            logger_1.default.error('Exception during exit execution', { id: position.id, error }); // Use id from ManagedPosition
            await (0, notifications_1.sendAlert)(`🚨 CRITICAL ERROR exiting position ${position.tokenSymbol || position.tokenAddress}! Error: ${error}`, 'CRITICAL'); // Use string literal
            return false;
        }
    }
    /**
     * Send notification about the position exit
     */
    async notifyExit(position, reason, estimatedExitPrice, actualSolReceived, initialSolCost) {
        let pnlPercentString;
        let pnlSolString = null;
        if (actualSolReceived !== undefined && initialSolCost !== undefined && initialSolCost > 0n) {
            // Calculate PNL based on actual SOL amounts
            const pnlLamports = actualSolReceived - initialSolCost;
            const pnlPercent = (Number(pnlLamports) / Number(initialSolCost)) * 100;
            pnlPercentString = pnlPercent.toFixed(2) + '% (Actual SOL)';
            pnlSolString = (Number(pnlLamports) / 1e9).toFixed(6) + ' SOL';
        }
        else {
            // Fallback to PNL based on estimated exit price
            const pnl = ((estimatedExitPrice - position.entryPrice) / position.entryPrice) * 100;
            pnlPercentString = pnl.toFixed(2) + '% (Est. Price)';
        }
        const durationMs = Date.now() - position.entryTime; // Use entryTime from ManagedPosition
        const durationMinutes = (durationMs / (1000 * 60)).toFixed(1);
        const message = `✅ EXIT: ${position.tokenSymbol || position.tokenAddress}\n` + // Use base Position fields
            `Reason: ${reason}\n` +
            `PnL: ${pnlPercentString}\n` +
            (pnlSolString ? `PnL (SOL): ${pnlSolString}\n` : '') +
            `Duration: ${durationMinutes} mins\n` +
            `Exit Price (Est): ${estimatedExitPrice.toFixed(6)}`;
        // Determine appropriate alert level based on PNL
        const alertLevel = (pnlPercentString.startsWith('-') ? 'WARN' : 'INFO');
        await (0, notifications_1.sendAlert)(message, alertLevel); // Pass the variable typed as AlertLevel
    }
    /**
     * Merge default config with user config
     */
    mergeConfig(defaultConfig, userConfig) {
        const mergedConfig = { ...defaultConfig };
        // Merge top-level objects
        for (const [key, value] of Object.entries(userConfig)) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                // Ensure type safety when merging nested objects
                if (key in mergedConfig && typeof mergedConfig[key] === 'object' && mergedConfig[key] !== null) {
                    mergedConfig[key] = { ...mergedConfig[key], ...value };
                }
                else {
                    mergedConfig[key] = value;
                }
            }
            else if (value !== undefined) { // Avoid overwriting with undefined from partial config
                mergedConfig[key] = value;
            }
        }
        return mergedConfig;
    }
}
exports.ExitManager = ExitManager;
exports.default = ExitManager;
//# sourceMappingURL=exitManager.js.map