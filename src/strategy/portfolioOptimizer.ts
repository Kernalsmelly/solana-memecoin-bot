import { PatternDetector, PatternMatch } from './patternDetector';
import { ExitManager, ManagedPosition } from './exitManager'; // Correct path
import { RiskManager } from '../live/riskManager';
import { PatternType, PatternDetection, TokenMetrics, TradeOrder, OrderExecutionResult, Position } from '../types'; // Removed Position import
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import logger from '../utils/logger';
import { OrderExecution } from '../orderExecution'; // Removed OrderExecutionResult import
import { BirdeyeAPI } from '../api/birdeyeAPI';

interface PortfolioDependencies {
  orderExecution: OrderExecution;
  riskManager: RiskManager;
  birdeyeApi: BirdeyeAPI;
  exitManager: ExitManager;
}

interface PortfolioConfig {
  maxPositions: number;
  maxExposurePercent?: number; // Optional: Max % of total capital (e.g., 50 for 50%)
  targetPositionValueUsd?: number; // Optional: Target value per position in USD
  minPositionValueUsd?: number; // Optional: Minimum value per position in USD
  patternAllocation: Record<PatternType, number>;
  minConfidence: number;
  preferNewTokens: boolean;
  maxPortfolioAllocationPercent?: number; // Optional: Max % of total capital (USD? SOL? Needs clarification) to allocate
}

/**
 * Portfolio Optimizer
 * Intelligently allocates capital across different trading patterns
 * to maximize returns while controlling risk
 */
export class PortfolioOptimizer {
  private config: PortfolioConfig & PortfolioDependencies;
  private activePositions: Map<string, ManagedPosition> = new Map();
  private patternPerformance: Record<PatternType, {
    successRate: number;
    avgReturn: number;
    recentTrades: number;
  }> = {} as Record<PatternType, any>;

  constructor(
    config: Partial<PortfolioConfig> & PortfolioDependencies
  ) {
    // Default configuration
    this.config = {
      // Merge dependencies into the config object
      orderExecution: config.orderExecution,
      riskManager: config.riskManager,
      birdeyeApi: config.birdeyeApi,
      exitManager: config.exitManager,
      // --- Default Config Values ---
      maxPositions: config.maxPositions ?? 5, // Default 5 positions
      maxExposurePercent: config.maxExposurePercent ?? 100, // Default 100%
      targetPositionValueUsd: config.targetPositionValueUsd ?? 50, // Default $50
      minPositionValueUsd: config.minPositionValueUsd ?? 10, // Default $10
      patternAllocation: config.patternAllocation ?? this.initializePatternAllocation(), // Default allocation
      minConfidence: config.minConfidence ?? 0.7, // Default 70% confidence
      preferNewTokens: config.preferNewTokens ?? true, // Default true
      maxPortfolioAllocationPercent: config.maxPortfolioAllocationPercent ?? 100, // Default 100%
    };

    // Initialize pattern performance tracking
    this.initializePatternPerformance();

    // Listen for exit events to update performance metrics
    this.config.exitManager.on('positionExit', this.handlePositionExit.bind(this));

    logger.info('Portfolio Optimizer initialized', {
      maxPositions: this.config.maxPositions,
      maxExposure: this.config.maxExposurePercent + '%'
    });
  }

  /**
   * Initialize pattern performance tracking
   */
  private initializePatternPerformance(): void {
    const patterns: PatternType[] = [
      'Mega Pump and Dump',
      'Volatility Squeeze',
      'Smart Money Trap',
      'Algorithmic Stop Hunt',
      'Smart Money Reversal'
    ];

    // Initialize with historical data (from memories)
    patterns.forEach(pattern => {
      let successRate = 80; // Default success rate
      let avgReturn = 30;   // Default average return

      // Set initial values based on historical performance
      switch (pattern) {
        case 'Mega Pump and Dump':
          avgReturn = 187.5;
          break;
        case 'Volatility Squeeze':
          avgReturn = 75.9;
          break;
        case 'Smart Money Trap':
          avgReturn = 66.8;
          break;
        case 'Algorithmic Stop Hunt':
          avgReturn = 61.0;
          break;
        case 'Smart Money Reversal':
          avgReturn = 55.3;
          break;
      }

      this.patternPerformance[pattern] = {
        successRate,
        avgReturn,
        recentTrades: 0
      };
    });
  }

  /**
   * Calculate the position size in SOL lamports based on risk management and pattern.
   */
  private async calculatePositionSizeLamports(patternDetection: PatternDetection): Promise<bigint> {
    try {
      const targetUsd = this.config.targetPositionValueUsd ?? 50; // Default $50
      const minUsd = this.config.minPositionValueUsd ?? 10; // Default $10

      // Fetch current SOL price
      const solPriceUsd = await this.config.birdeyeApi.getSolPrice();
      if (!solPriceUsd) { // getSolPrice returns number or throws
        logger.error('Failed to fetch SOL price for position sizing.');
        return 0n;
      }

      // Calculate target SOL amount and convert to lamports
      const targetSolAmount = targetUsd / solPriceUsd;
      const targetLamports = BigInt(Math.floor(targetSolAmount * LAMPORTS_PER_SOL));

      // Check minimum position value
      const minSolAmount = minUsd / solPriceUsd;
      const minLamports = BigInt(Math.floor(minSolAmount * LAMPORTS_PER_SOL));

      if (targetLamports < minLamports) {
        logger.warn(`Target position value ($${targetUsd}) is below minimum ($${minUsd}) for ${patternDetection.metrics.symbol} at current SOL price ($${solPriceUsd}). Calculated lamports: ${targetLamports}, Min lamports: ${minLamports}.`, {
          token: patternDetection.tokenAddress,
          targetLamports: targetLamports.toString(),
          minLamports: minLamports.toString(),
        });
        return 0n; // Position too small
      }

      // TODO: Optionally consult RiskManager for overall exposure limits here

      logger.info(`Calculated position size for ${patternDetection.metrics.symbol}: ${targetLamports} lamports ($${targetUsd.toFixed(2)} USD)`, {
        token: patternDetection.tokenAddress,
        targetLamports: targetLamports.toString(),
        solPrice: solPriceUsd,
      });
      return targetLamports;
    } catch (error: any) {
      logger.error(`Error calculating position size for ${patternDetection.metrics.symbol}:`, error?.message || error);
      return 0n;
    }
  }

  /**
   * Process new pattern detection for portfolio consideration
   * Returns the ManagedPosition if a buy order is successfully executed, otherwise null.
   */
  public async evaluatePattern(patternDetection: PatternDetection): Promise<ManagedPosition | null> {
    try {
      // Check if we can add new positions
      if (!(await this.canAddPosition())) {
        logger.debug('Cannot add position - portfolio full or max exposure reached');
        return null;
      }

      // Check minimum confidence threshold
      if (patternDetection.confidence < this.config.minConfidence) {
        logger.debug('Pattern confidence below threshold', {
          pattern: patternDetection.pattern,
          confidence: patternDetection.confidence,
          threshold: this.config.minConfidence
        });
        return null;
      }

      // Calculate position size
      const positionSizeLamports = await this.calculatePositionSizeLamports(patternDetection);

      if (positionSizeLamports <= 0n) {
        logger.debug('Position size calculation returned zero or negative', {
          pattern: patternDetection.pattern,
          token: patternDetection.metrics.symbol
        });
        return null;
      }

      // Create Buy Order
      const buyOrder: TradeOrder = {
        side: 'buy',
        tokenAddress: patternDetection.tokenAddress,
        size: positionSizeLamports, // Size is in SOL lamports for buys
        price: patternDetection.metrics.price, // Current price observed
        timestamp: Date.now(), // Timestamp of order creation
      };

      // Execute Buy Order
      logger.info(`Attempting to execute buy order for ${patternDetection.metrics.symbol}`, {
        token: patternDetection.tokenAddress,
        amountLamports: positionSizeLamports.toString()
      });

      const executionResult = await this.config.orderExecution.executeOrder(buyOrder);

      if (!executionResult || !executionResult.success) {
        logger.error(`Buy order execution failed for ${patternDetection.metrics.symbol}`, {
          error: executionResult?.error || 'Unknown execution error',
          details: executionResult?.details
        });
        return null; // Stop processing if buy fails
      }

      logger.info(`Successfully executed buy for ${patternDetection.metrics.symbol}`, { 
        tx: executionResult.txSignature,
        solSpent: (Number(executionResult.inputAmount || 0n) / LAMPORTS_PER_SOL).toFixed(6),
        tokenReceived: executionResult.outputAmount?.toString() 
      });

      // --- Position Creation (Only after successful buy) ---

      // Fetch actual decimals (might be cached by orderExecution)
      const tokenDecimals = await this.config.orderExecution.getTokenDecimals(patternDetection.tokenAddress);

      // Ensure we have the executed quantity
      const executedQuantitySmallestUnit = executionResult.outputAmount;
      if (executedQuantitySmallestUnit === undefined || executedQuantitySmallestUnit === null || executedQuantitySmallestUnit <= 0n) {
        logger.error(`Buy order for ${patternDetection.metrics.symbol} reported success but returned invalid quantity`, { result: executionResult });
        return null; // Cannot create position without valid quantity
      }

      // Create a new ManagedPosition object
      const newPosition: ManagedPosition = {
        // ManagedPosition specific properties
        id: `${patternDetection.tokenAddress}-${Date.now()}`,
        pattern: patternDetection.pattern as PatternType, // Explicitly cast string to PatternType
        entryTime: Date.now(),
        // Position properties
        tokenAddress: patternDetection.tokenAddress,
        tokenSymbol: patternDetection.metrics.symbol,
        tokenMint: new PublicKey(patternDetection.tokenAddress), // Assuming address is mint for now
        tokenDecimals: tokenDecimals,
        // Calculate entry price: (SOL spent / quantity received) * SOL/USD price
        // Need SOL price from earlier calculation if not stored
        // Need executed input lamports from result
        // entryPrice: calculateEntryPrice(executionResult, solPriceUsd), // Placeholder for calculation
        entryPrice: executionResult.actualExecutionPrice || patternDetection.metrics.price, // Use actual if available
        entryTimestamp: executionResult.timestamp || Date.now(),
        initialSolCostLamports: executionResult.inputAmount || positionSizeLamports, // SOL spent
        quantity: BigInt(executedQuantitySmallestUnit), // Token quantity in smallest unit (BigInt)

        currentPrice: executionResult.actualExecutionPrice || patternDetection.metrics.price, // Initial current price
        stopLoss: 0, // Placeholder - ExitManager will set this
        takeProfit: 0, // Placeholder - ExitManager will set this
        pnl: 0, // Initial PnL
        status: 'open', // Initial status
        timestamp: Date.now(), // Base position timestamp
      };

      this.activePositions.set(newPosition.id, newPosition);

      logger.info('New position added to portfolio', { id: newPosition.id, token: newPosition.tokenSymbol, pattern: newPosition.pattern });
      
      // Let ExitManager start monitoring this position
      await this.config.exitManager.addPosition(newPosition);

      // Return the newly created ManagedPosition
      return newPosition;
    } catch (error: any) {
      logger.error('Error evaluating pattern:', error?.message || error);
      return null;
    }
  }

  /**
   * Handle position exit to update performance metrics
   */
  public handlePositionExit(positionId: string, pnlPercent?: number, reason?: string): void {
    try {
      const position = this.activePositions.get(positionId);
      if (position) {
        logger.info(`PortfolioOptimizer handling position exit: ${position.tokenSymbol} (${positionId})`, { pnl: pnlPercent, reason });
        this.activePositions.delete(positionId);
        // Update pattern performance based on pnlPercent
        this.updatePatternPerformance(position.pattern as PatternType, pnlPercent);
      }
    } catch (error: any) {
      logger.error('Error handling position exit', error);
    }
  }

  /**
   * Update performance metrics for a given pattern based on a closed trade's PNL.
   */
  private updatePatternPerformance(pattern: PatternType, pnlPercent?: number): void {
    if (!this.patternPerformance[pattern]) {
      logger.warn(`Attempted to update performance for unknown pattern: ${pattern}`);
      return;
    }

    const perf = this.patternPerformance[pattern];
    const currentTotalReturn = perf.avgReturn * perf.recentTrades;
    const currentWins = perf.successRate * perf.recentTrades / 100;

    perf.recentTrades += 1;
    const newPnl = pnlPercent ?? 0; // Treat undefined PNL as 0% for calculations
    const newWins = currentWins + (newPnl > 0 ? 1 : 0);

    perf.successRate = (newWins / perf.recentTrades) * 100;
    perf.avgReturn = (currentTotalReturn + newPnl) / perf.recentTrades;

    logger.debug(`Updated performance for pattern: ${pattern}`, {
      successRate: perf.successRate.toFixed(2) + '%',
      avgReturn: perf.avgReturn.toFixed(2) + '%',
      trades: perf.recentTrades
    });
  }

  /**
   * Check if we can add a new position (async due to exposure check)
   */
  private async canAddPosition(): Promise<boolean> {
    // Check position count limit
    if (this.activePositions.size >= this.config.maxPositions) {
      logger.debug(`Cannot add position: Already at max positions (${this.config.maxPositions})`);
      return false;
    }

    // TODO: Verify RiskManager balance units (SOL vs USD)
    const currentSolBalance = await this.config.riskManager.getCurrentBalance(); // NEEDS VERIFICATION
    const maxSolExposureLimit = currentSolBalance * ((this.config.maxExposurePercent ?? 100) / 100);
    const currentSolExposure = await this.getCurrentExposureSol();

    if (currentSolExposure >= maxSolExposureLimit) {
      logger.debug(`Cannot add position: Current SOL exposure (${currentSolExposure}) meets or exceeds limit (${maxSolExposureLimit})`);
      return false;
    }

    return true;
  }

  /**
   * Get current portfolio exposure in SOL.
   * Assumes position.initialSolCostLamports stores the initial investment.
   */
  private async getCurrentExposureSol(): Promise<number> {
    let totalExposureLamports = 0n;

    for (const position of this.activePositions.values()) {
      // Use initial SOL cost if available, otherwise log warning
      if (position.initialSolCostLamports !== undefined) {
        totalExposureLamports += position.initialSolCostLamports;
      } else {
        logger.warn(`Position ${position.id} missing initialSolCostLamports for exposure calculation.`);
      }
    }

    const totalExposureSol = Number(totalExposureLamports) / LAMPORTS_PER_SOL;
    logger.debug(`Current total SOL exposure: ${totalExposureSol} (${totalExposureLamports} lamports)`);
    return totalExposureSol;
  }

  /**
   * Get all active positions
   */
  public getActivePositions(): ManagedPosition[] {
    return Array.from(this.activePositions.values());
  }

  /**
   * Get pattern performance metrics
   */
  public getPatternPerformance(): Record<PatternType, any> {
    return { ...this.patternPerformance };
  }

  /**
   * Update portfolio configuration
   */
  public updateConfig(config: Partial<PortfolioConfig>): void {
    if (config.patternAllocation) {
      // Ensure allocations sum to 100%
      const sum = Object.values(config.patternAllocation).reduce((a, b) => a + b, 0);

      if (Math.abs(sum - 100) > 1) { // Allow for small rounding errors
        logger.warn('Pattern allocations do not sum to 100%', {
          sum,
          allocations: config.patternAllocation
        });

        // Normalize allocations
        for (const pattern in config.patternAllocation) {
          config.patternAllocation[pattern as PatternType] = 
            (config.patternAllocation[pattern as PatternType] / sum) * 100;
        }
      }
    }

    this.config = {
      ...this.config,
      ...config
    };

    logger.info('Portfolio optimizer configuration updated', {
      maxPositions: this.config.maxPositions,
      targetPositionValueUsd: this.config.targetPositionValueUsd,
      maxExposure: this.config.maxExposurePercent + '%'
    });
  }

  /**
   * Placeholder: Evaluate a token and decide whether to buy.
   * TODO: Implement actual vetting and buying logic.
   */
  public async evaluateAndBuy(tokenInfo: any): Promise<ManagedPosition | null> {
    logger.warn('PortfolioOptimizer.evaluateAndBuy is a placeholder. Implement logic!', { tokenInfo });
    // Example: Always return null for now to prevent unintended buys
    return null; 
  }

  /**
   * Placeholder: Handle notification that a position was closed.
   * TODO: Implement logic to update internal state/metrics.
   */
  public handlePositionClosure(tokenAddress: string): void {
    logger.warn('PortfolioOptimizer.handlePositionClosure is a placeholder. Implement logic!', { tokenAddress });
    if (this.activePositions.has(tokenAddress)) {
        this.activePositions.delete(tokenAddress);
        logger.info(`Placeholder: Removed closed position ${tokenAddress} from active positions.`);
    } else {
        logger.warn(`Placeholder: Received closure for unknown/already removed position ${tokenAddress}.`);
    }
  }

  private initializePatternAllocation(): Record<PatternType, number> {
    // Default: Equal allocation if not specified
    // TODO: Allow loading this from config file/env vars
    const defaultAllocation = 20; // Example: 20% per pattern if 5 patterns
    return {
      "Mega Pump and Dump": defaultAllocation,
      "Volatility Squeeze": defaultAllocation,
      "Smart Money Trap": defaultAllocation,
      "Algorithmic Stop Hunt": defaultAllocation,
      "Smart Money Reversal": defaultAllocation,
      "Volume Divergence": defaultAllocation,
      "Hidden Accumulation": defaultAllocation,
      "Wyckoff Spring": defaultAllocation,
      "Liquidity Grab": defaultAllocation,
      "FOMO Cycle": defaultAllocation,
    };
  }
}
