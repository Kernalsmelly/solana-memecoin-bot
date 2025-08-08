import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import { LiveOrderExecution } from '../orderExecution.js';
import { OrderExecution } from '../types.js';
import { Position, TradeOrder } from '../types.js';
import { tradeLogger } from '../utils/tradeLogger.js';
import { RiskManager } from '../live/riskManager.js';
import { BirdeyeAPI } from '../api/birdeyeAPI.js';
import { sendAlert, AlertLevel } from '../utils/notifications.js';
import { PublicKey } from '@solana/web3.js';
import { PatternType } from '../types.js';

// Define state for trailing stop
interface TrailingStopState {
  percent: number;
  highestPrice: number;
  stopPrice: number;
}

// Define ManagedPosition extending global Position with ExitManager specific fields
export interface ManagedPosition extends Omit<Position, 'size' | 'quantity'> {
  // Omit potentially conflicting fields
  id: string; // Unique identifier for this managed position instance
  pattern: PatternType; // Track the pattern that triggered the entry
  entryTime: number; // Timestamp of entry
  entryTimestamp: number; // Timestamp when position was entered
  trailingStop?: TrailingStopState; // State for trailing stop loss
  initialSolCostLamports?: bigint; // Cost in lamports
  quantity: bigint; // Quantity held in token's smallest unit
  exitPrice?: number; // Added optional exit price
}

// Define ExitRule interface (needed by ExitManagerConfig)
export interface ExitRule {
  type: 'time' | 'profit' | 'loss' | 'trailing' | 'volatility';
  value: number; // e.g., percentage for profit/loss/trail, hours for time, periods for volatility
  multiplier?: number; // e.g., std dev multiplier for volatility
  activation?: number; // e.g., activation threshold for trailing stop
  description: string;
}

// Define ExitManagerConfig interface (copy from types/index.ts or original definition)
// Update based on constructor usage
export interface ExitManagerConfig {
  timeBasedExits: {
    maxHoldingTimeHours: number;
    quickProfitMinutes?: number; // Optional quick profit rule
    quickProfitThreshold?: number;
  };
  profitExits: {
    takeProfit: number;
    megaProfitExit?: {
      // Optional mega profit rule
      threshold: number;
      lockInPercent: number;
    };
    superProfitExit?: number; // Optional super profit target
  };
  lossExits: {
    stopLoss: number;
    timeBasedStopAdjustment?: {
      // Optional time-based stop adjustment
      afterMinutes: number;
      newStopPercent: number;
    };
  };
  trailingStops: {
    enabled: boolean;
    activationThreshold: number; // Profit percentage to activate trailing stop
    trailPercent: number; // Percentage below high price to set stop
  };
  volatilityExits: {
    enabled: boolean;
    lookbackPeriods: number;
    stdDevMultiplier: number;
  };
  patternSpecificRules: {
    [patternName: string]: ExitRule[];
  };
}

// Basic deep merge utility
function isObject(item: any): item is Record<string, any> {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge<T extends object, S extends object>(target: T, source: S): T & S {
  const output = Object.assign({}, target) as T & S;
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      const targetValue = (target as Record<string, any>)[key];
      const sourceValue = (source as Record<string, any>)[key];

      if (isObject(targetValue) && isObject(sourceValue)) {
        (output as Record<string, any>)[key] = deepMerge(targetValue, sourceValue);
      } else {
        (output as Record<string, any>)[key] = sourceValue;
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
export class ExitManager extends EventEmitter {
  private positions: Map<string, ManagedPosition> = new Map(); // Use ManagedPosition
  private config: ExitManagerConfig;
  private orderExecution: OrderExecution;
  private riskManager: RiskManager;
  private birdeyeApi?: BirdeyeAPI; // Add BirdeyeAPI instance
  private priceUpdateInterval: NodeJS.Timeout | null = null;
  private analysisInterval: NodeJS.Timeout | null = null;

  // Quick cache for last N prices for volatility calculation
  private priceHistory: Map<string, number[]> = new Map<string, number[]>(); // Explicit typing. Key should be tokenAddress

  constructor(
    orderExecution: OrderExecution,
    riskManager: RiskManager,
    birdeyeApi?: BirdeyeAPI,
    config?: Partial<ExitManagerConfig>,
  ) {
    super();
    this.orderExecution = orderExecution;
    this.riskManager = riskManager;
    this.birdeyeApi = birdeyeApi; // Store the instance

    // Default configuration
    this.config = {
      timeBasedExits: {
        maxHoldingTimeHours: 24,
        quickProfitMinutes: 15,
        quickProfitThreshold: 10, // 10% profit in 15 minutes = exit
      },
      profitExits: {
        takeProfit: 30, // 30% profit target
        megaProfitExit: { threshold: 50, lockInPercent: 40 }, // Example: Activate at 50%, lock in 40%
        superProfitExit: 150, // 150% = super profit exit
      },
      lossExits: {
        stopLoss: -10, // 10% stop loss
        timeBasedStopAdjustment: { afterMinutes: 60, newStopPercent: -5 }, // Tighten stop after 1 hour
      },
      trailingStops: {
        enabled: true,
        activationThreshold: 15, // start trailing at 15% profit
        trailPercent: 10, // trail by 10% of peak price
      },
      volatilityExits: {
        enabled: true,
        lookbackPeriods: 10,
        stdDevMultiplier: 2.5,
      },
      patternSpecificRules: {},
    };

    // Apply custom config if provided
    if (config) {
      this.config = deepMerge(this.config, config); // Use deep merge
    }

    logger.info('Exit Manager initialized', {
      patternRules: Object.keys(this.config.patternSpecificRules),
    });
  }

  /**
   * Start monitoring positions for exit signals
   */
  public start(): void {
    // Update prices every 10 seconds
    this.priceUpdateInterval = setInterval(() => {
      this.updatePositionPrices();
    }, 10000);

    // Analyze for exit signals every 30 seconds
    this.analysisInterval = setInterval(() => {
      this.analyzePositionsForExits();
    }, 30000);

    logger.info('Exit Manager started');
  }

  /**
   * Stop monitoring positions
   */
  public stop(): void {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    logger.info('Exit Manager stopped');
  }

  /**
   * Track a new position
   */
  public addPosition(position: ManagedPosition): void {
    // Use ManagedPosition
    this.positions.set(position.id, position); // Use id from ManagedPosition

    // Initialize price history for this token
    this.priceHistory.set(position.tokenAddress, [position.entryPrice]); // Use tokenAddress as key

    // Set initial stop loss and take profit based on rules
    const updatedPosition = this.applyExitRules(position); // applyExitRules now uses/returns ManagedPosition
    this.positions.set(position.id, updatedPosition); // Use id from ManagedPosition

    logger.info('Position added to Exit Manager', {
      id: updatedPosition.id, // Use id from ManagedPosition
      token: updatedPosition.tokenSymbol || updatedPosition.tokenAddress, // Use base Position fields
      pattern: updatedPosition.pattern, // Use pattern from ManagedPosition
      stopLoss: updatedPosition.stopLoss,
      takeProfit: updatedPosition.takeProfit,
    });

    // Emit event
    this.emit('positionAdded', updatedPosition);
  }

  /**
   * Remove a tracked position
   */
  public removePosition(positionId: string): void {
    const position = this.positions.get(positionId);
    if (position) {
      // Check existence before deleting
      this.positions.delete(positionId);
      this.priceHistory.delete(position.tokenAddress); // Use tokenAddress as key
      logger.info('Position removed from Exit Manager', { id: positionId });
      this.emit('positionRemoved', positionId);
    }
  }

  /**
   * Get all currently tracked positions
   */
  public getPositions(): ManagedPosition[] {
    // Return ManagedPosition array
    return Array.from(this.positions.values());
  }

  /**
   * Update exit rules for a specific position
   */
  public updatePositionExitRules(
    positionId: string,
    updates: Partial<ManagedPosition>,
  ): ManagedPosition | null {
    // Use ManagedPosition
    const position = this.positions.get(positionId);
    if (!position) {
      return null;
    }

    // Ensure updates includes potential trailingStop changes if needed
    const updatedPosition: ManagedPosition = { ...position, ...updates }; // Type assertion
    this.positions.set(positionId, updatedPosition);

    logger.info('Position exit rules updated', {
      id: positionId,
      updates: {
        stopLoss: updates.stopLoss,
        takeProfit: updates.takeProfit,
        trailingStop: updates.trailingStop, // Access trailingStop directly from updates
      },
    });

    return updatedPosition;
  }

  /**
   * Manual exit for a position
   */
  public async exitPosition(positionId: string, reason: string): Promise<boolean> {
    const position = this.positions.get(positionId); // position is ManagedPosition | undefined
    if (!position) {
      logger.warn('Cannot exit position: not found', { id: positionId });
      return false;
    }

    try {
      const result = await this.executeExit(position, reason); // executeExit takes ManagedPosition
      if (result) {
        this.removePosition(positionId);
      }
      return result;
    } catch (error) {
      logger.error('Error during position exit', {
        positionId: positionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Update prices for all tracked positions
   */
  private async updatePositionPrices(): Promise<void> {
    logger.debug('Updating position prices...');
    const pricePromises: Promise<void>[] = [];

    const openPositions = Array.from(this.positions.values()).filter((p) => p.status === 'open');

    if (openPositions.length === 0) {
      logger.debug('No open positions to update prices for.');
      return;
    }

    for (const position of openPositions) {
      if (position.status === 'open') {
        pricePromises.push(
          this._fetchPrice(position.tokenAddress).then((price) => {
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
                    logger.info(`[ExitManager] Emergency stop reset by user or system.`);
                    tradeLogger.logScenario('EMERGENCY_STOP_RESET', {
                      event: 'emergencyStopReset',
                      details: 'Emergency stop successfully reset',
                      timestamp: new Date().toISOString(),
                    });
                    logger.warn(`[ExitManager] Forced exit triggered for ${position.tokenSymbol}`);
                    tradeLogger.logScenario('FORCED_EXIT', {
                      event: 'forcedExit',
                      token: position.tokenSymbol,
                      reason: 'forced exit',
                      timestamp: new Date().toISOString(),
                    });
                    logger.debug(
                      `Trailing stop updated for ${currentPosition.tokenSymbol || position.id}`,
                      { newStopPrice: trailingStop.stopPrice },
                    );
                  }
                }
              }
            }
          }),
        );
      }
    }

    try {
      await Promise.all(pricePromises);
      logger.info(`Finished price updates for ${openPositions.length} open positions.`);
    } catch (error) {
      logger.error('Error occurred during batch price update processing', { error });
    }
  }

  /**
   * Fetches the current price for a token using BirdeyeAPI.
   * Includes basic error handling and logging.
   */
  private async _fetchPrice(tokenAddress: string): Promise<number | null> {
    try {
      // Corrected method name based on lint feedback
      if (!this.birdeyeApi) {
        logger.warn(`BirdeyeAPI is not available. Cannot fetch price for ${tokenAddress}`);
        return null;
      }
      const priceObj = await this.birdeyeApi.getTokenPrice(tokenAddress);
      const price = priceObj?.priceUsd;
      if (typeof price !== 'number' || isNaN(price)) {
        logger.warn(`Received invalid price for ${tokenAddress}`, { price });
        return null;
      }
      return price;
    } catch (error) {
      logger.error(`Failed to fetch price for ${tokenAddress} from BirdeyeAPI`, { error });
      return null;
    }
  }

  /**
   * Analyze all positions for exit signals
   */
  private async analyzePositionsForExits(): Promise<void> {
    for (const position of this.positions.values()) {
      // position is ManagedPosition
      try {
        const exitReason =
          this.checkProfitLossRules(position) ||
          this.checkTrailingStop(position) ||
          this.checkTimeBasedRules(position) ||
          this.checkVolatilityRules(position);

        if (exitReason) {
          logger.info('Exit signal detected', {
            positionId: position.id,
            token: position.tokenSymbol || position.tokenAddress,
            reason: exitReason,
            signal: exitReason,
          });

          // Execute exit
          const success = await this.executeExit(position, exitReason);

          if (success) {
            this.removePosition(position.id);
          }
        }
      } catch (error) {
        logger.error('Error analyzing position for exits', {
          positionId: position.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Check profit/loss targets and stop loss
   * @returns Exit reason string if triggered, null otherwise
   */
  private checkProfitLossRules(position: ManagedPosition): string | null {
    // Use ManagedPosition
    // Ensure currentPrice is available
    if (typeof position.currentPrice !== 'number') {
      logger.warn('Skipping P/L check due to missing currentPrice', { id: position.id });
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
  private checkTrailingStop(position: ManagedPosition): string | null {
    // Use ManagedPosition
    if (!this.config.trailingStops.enabled || !position.trailingStop) {
      // Access trailingStop from ManagedPosition
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
      const updatedPosition = {
        ...position,
        trailingStop: {
          ...position.trailingStop,
          highestPrice: newHighestPrice,
          stopPrice: newStopPrice,
        },
      };
      this.positions.set(position.id, updatedPosition);
      updated = true;
      logger.debug('Trailing stop adjusted upwards', {
        id: position.id,
        newStop: newStopPrice.toFixed(6),
      });
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
  private checkTimeBasedRules(position: ManagedPosition): string | null {
    // Use ManagedPosition
    // Use specific rules if defined for the pattern
    const patternRules = this.config.patternSpecificRules[position.pattern] || []; // Use pattern from ManagedPosition
    const timeRule = patternRules.find((r) => r.type === 'time');

    // Configurable times
    const maxHoldingTimeHours = timeRule
      ? timeRule.value
      : this.config.timeBasedExits.maxHoldingTimeHours;

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
  private checkVolatilityRules(position: ManagedPosition): string | null {
    // Use ManagedPosition
    if (!this.config.volatilityExits.enabled) return null;

    // Use specific rules if defined for the pattern
    const patternRules = this.config.patternSpecificRules[position.pattern] || []; // Use pattern from ManagedPosition
    const volatilityRule = patternRules.find((r) => r.type === 'volatility');

    const lookback = volatilityRule
      ? volatilityRule.value
      : this.config.volatilityExits.lookbackPeriods;
    const stdDevMult = volatilityRule
      ? (volatilityRule as any).multiplier || this.config.volatilityExits.stdDevMultiplier
      : this.config.volatilityExits.stdDevMultiplier;

    // Get price history for the token
    const prices = this.priceHistory.get(position.tokenAddress); // Use tokenAddress as key
    // Need at least 2 prices for return calculation and enough for lookback
    if (!prices || prices.length < 2 || prices.length < lookback) {
      return null; // Not enough data
    }

    // Ensure current price is valid before proceeding
    if (typeof position.currentPrice !== 'number') {
      logger.warn('Skipping volatility check due to missing current price', { id: position.id });
      return null;
    }

    // Calculate historical volatility
    const returns: number[] = []; // Explicitly type as number[]
    // Ensure we only iterate over valid indices
    for (let i = Math.max(1, prices.length - lookback + 1); i < prices.length; i++) {
      // Explicitly check previous price existence and type before calculation
      const prevPrice = prices[i - 1];
      const currentPriceAtIndex = prices[i]; // Check current price at index i too
      if (typeof prevPrice === 'number') {
        if (typeof currentPriceAtIndex === 'number') {
          const returnPct = (currentPriceAtIndex - prevPrice) / prevPrice;
          returns.push(returnPct);
        } else {
          logger.warn(`Skipping return calculation due to invalid current price at index ${i}`, {
            id: position.id,
          });
        }
      } else {
        logger.warn(`Skipping return calculation due to invalid previous price at index ${i - 1}`, {
          id: position.id,
        });
      }
    }

    if (returns.length === 0) return null; // No returns calculated

    // Calculate standard deviation of returns
    const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
    const variance =
      returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Check if current return exceeds volatility threshold
    // Safely access the second to last price
    const previousPrice = prices[prices.length - 2];
    // Added check for currentPrice validity above
    // Explicitly check previousPrice before using it
    if (typeof previousPrice !== 'number') {
      logger.warn('Skipping volatility return check due to missing previous price', {
        id: position.id,
      });
      return null;
    }
    const currentReturn = (position.currentPrice - previousPrice) / previousPrice;

    const volatilityThreshold = stdDev * stdDevMult;

    if (Math.abs(Number(currentReturn)) > Number(volatilityThreshold)) {
      // Explicitly cast to Number
      // Only exit on negative volatility spikes if we're in profit
      // or if the volatility is extreme
      const pnlPercent =
        ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;

      if (
        currentReturn < 0 &&
        (pnlPercent > 5 || Math.abs(currentReturn) > volatilityThreshold * 1.5)
      ) {
        return `Volatility Spike (${(currentReturn * 100).toFixed(2)}%, threshold: ${(volatilityThreshold * 100).toFixed(2)}%)`;
      }
    }

    return null;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(data: number[]): number {
    if (data.length < 2) return 0;
    const n = data.length;
    const mean = data.reduce((sum, val) => sum + val, 0) / n;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1); // Use sample variance
    return Math.sqrt(variance);
  }

  /**
   * Apply default and pattern-specific rules to set initial SL/TP/Trailing
   * Also activates trailing stop if conditions are met.
   */
  private applyExitRules(position: ManagedPosition): ManagedPosition {
    // Use ManagedPosition
    const updatedPosition: ManagedPosition = { ...position }; // Ensure type

    // Use specific rules if defined for the pattern
    const patternRules = this.config.patternSpecificRules[position.pattern] || []; // Use pattern from ManagedPosition

    // Get potential pattern specific SL/TP/Trailing % overrides
    const patternStopLossRule = patternRules.find((r) => r.type === 'loss');
    const patternTakeProfitRule = patternRules.find((r) => r.type === 'profit');
    const patternTrailingRule = patternRules.find((r) => r.type === 'trailing');

    // Set initial Stop Loss (as a price level)
    const stopLossPercent = patternStopLossRule
      ? patternStopLossRule.value
      : this.config.lossExits.stopLoss;
    updatedPosition.stopLoss = position.entryPrice * (1 + stopLossPercent / 100); // stopLoss exists on base Position

    // Set initial Take Profit (as a price level)
    const takeProfitPercent = patternTakeProfitRule
      ? patternTakeProfitRule.value
      : this.config.profitExits.takeProfit;
    updatedPosition.takeProfit = position.entryPrice * (1 + takeProfitPercent / 100); // takeProfit exists on base Position

    // Initialize trailing stop state if enabled and activation threshold met
    const trailActivationPercent = patternTrailingRule
      ? (patternTrailingRule as any).activation || this.config.trailingStops.activationThreshold
      : this.config.trailingStops.activationThreshold;
    const trailPercent = patternTrailingRule
      ? patternTrailingRule.value
      : this.config.trailingStops.trailPercent;
    const currentProfitPercent =
      ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;

    if (
      this.config.trailingStops.enabled &&
      !updatedPosition.trailingStop && // Check trailingStop on ManagedPosition
      currentProfitPercent >= trailActivationPercent
    ) {
      const stopPrice = position.currentPrice * (1 - trailPercent / 100);
      updatedPosition.trailingStop = {
        // Set trailingStop on ManagedPosition
        percent: trailPercent,
        highestPrice: position.currentPrice,
        stopPrice: stopPrice,
      };
      logger.debug('Trailing stop activated on position add', { id: position.id, stopPrice }); // Use id from ManagedPosition
    }

    return updatedPosition;
  }

  /**
   * Execute the actual exit order
   * @returns True if exit was successful, false otherwise
   */
  private async executeExit(position: ManagedPosition, reason: string): Promise<boolean> {
    // Use ManagedPosition
    logger.info('Attempting to execute exit', {
      id: position.id, // Use id from ManagedPosition
      token: position.tokenSymbol || position.tokenAddress, // Use base Position fields
      reason: reason,
    });

    try {
      // Construct TradeOrder compatible with LiveOrderExecution
      const sellOrder: TradeOrder = {
        tokenAddress: position.tokenAddress,
        side: 'sell',
        size: position.quantity,
        price: position.currentPrice,
      };

      const result = await this.orderExecution.executeOrder(sellOrder);

      if (result.success) {
        // Calculate actual PNL if possible
        const actualSolReceived: bigint | undefined =
          typeof result.inputAmount === 'number' ? BigInt(result.inputAmount) : result.inputAmount; // SOL received from sell
        const initialSolCost: bigint | undefined = position.initialSolCostLamports;

        // Use currentPrice for notification as a fallback or if SOL amounts missing
        this.notifyExit(position, reason, position.currentPrice, actualSolReceived, initialSolCost);
        this.emit('positionClosed', { position, reason });
        return true;
      } else {
        logger.error('Failed to execute exit order', { id: position.id, error: result.error }); // Use id from ManagedPosition
        await sendAlert(
          `🚨 Failed to exit position ${position.tokenSymbol || position.tokenAddress}! Reason: ${result.error}`,
          'CRITICAL',
        ); // Use string literal
        return false;
      }
    } catch (error) {
      logger.error('Exception during exit execution', { id: position.id, error }); // Use id from ManagedPosition
      await sendAlert(
        `🚨 CRITICAL ERROR exiting position ${position.tokenSymbol || position.tokenAddress}! Error: ${error}`,
        'CRITICAL',
      ); // Use string literal
      return false;
    }
  }

  /**
   * Send notification about the position exit
   */
  private async notifyExit(
    position: ManagedPosition,
    reason: string,
    estimatedExitPrice: number,
    actualSolReceived?: bigint,
    initialSolCost?: bigint,
  ): Promise<void> {
    let pnlPercentString: string;
    let pnlSolString: string | null = null;

    if (actualSolReceived !== undefined && initialSolCost !== undefined && initialSolCost > 0n) {
      // Calculate PNL based on actual SOL amounts
      const pnlLamports = actualSolReceived - initialSolCost;
      const pnlPercent = (Number(pnlLamports) / Number(initialSolCost)) * 100;
      pnlPercentString = pnlPercent.toFixed(2) + '% (Actual SOL)';
      pnlSolString = (Number(pnlLamports) / 1e9).toFixed(6) + ' SOL';
    } else {
      // Fallback to PNL based on estimated exit price
      const pnl = ((estimatedExitPrice - position.entryPrice) / position.entryPrice) * 100;
      pnlPercentString = pnl.toFixed(2) + '% (Est. Price)';
    }

    const durationMs = Date.now() - position.entryTime; // Use entryTime from ManagedPosition
    const durationMinutes = (durationMs / (1000 * 60)).toFixed(1);

    const message =
      `✅ EXIT: ${position.tokenSymbol || position.tokenAddress}\n` + // Use base Position fields
      `Reason: ${reason}\n` +
      `PnL: ${pnlPercentString}\n` +
      (pnlSolString ? `PnL (SOL): ${pnlSolString}\n` : '') +
      `Duration: ${durationMinutes} mins\n` +
      `Exit Price (Est): ${estimatedExitPrice.toFixed(6)}`;

    // Determine appropriate alert level based on PNL
    const alertLevel: AlertLevel = (
      pnlPercentString.startsWith('-') ? 'WARN' : 'INFO'
    ) as AlertLevel;
    await sendAlert(message, alertLevel); // Pass the variable typed as AlertLevel
  }

  /**
   * Merge default config with user config
   */
  private mergeConfig(
    defaultConfig: ExitManagerConfig,
    userConfig: Partial<ExitManagerConfig>,
  ): ExitManagerConfig {
    const mergedConfig = { ...defaultConfig };

    // Merge top-level objects
    for (const [key, value] of Object.entries(userConfig)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Ensure type safety when merging nested objects
        if (
          key in mergedConfig &&
          typeof (mergedConfig as any)[key] === 'object' &&
          (mergedConfig as any)[key] !== null
        ) {
          (mergedConfig as any)[key] = { ...(mergedConfig as any)[key], ...value };
        } else {
          (mergedConfig as any)[key] = value;
        }
      } else if (value !== undefined) {
        // Avoid overwriting with undefined from partial config
        (mergedConfig as any)[key] = value;
      }
    }

    return mergedConfig;
  }
}

export default ExitManager;
