// src/tradeSimulator.ts
import { v4 as uuidv4 } from 'uuid';
import { tradeLogger } from './utils/tradeLogger.js';
// Trade types
export var TradeType;
(function (TradeType) {
    TradeType["BUY"] = "BUY";
    TradeType["SELL"] = "SELL";
})(TradeType || (TradeType = {}));
export class TradeSimulator {
    tradeHistory = [];
    totalTrades = 0;
    wins = 0;
    losses = 0;
    profitSum = 0;
    profitSquares = 0;
    maxDrawdown = 0;
    bestTrade = null;
    worstTrade = null;
    updateStats(trade) {
        this.totalTrades++;
        if (typeof trade.profitLoss === 'number') {
            this.profitSum += trade.profitLoss;
            this.profitSquares += trade.profitLoss * trade.profitLoss;
            if (trade.profitLoss > 0)
                this.wins++;
            else
                this.losses++;
            if (!this.bestTrade || trade.profitLoss > (this.bestTrade.profitLoss ?? -Infinity))
                this.bestTrade = trade;
            if (!this.worstTrade || trade.profitLoss < (this.worstTrade.profitLoss ?? Infinity))
                this.worstTrade = trade;
        }
        if (typeof trade.profitLoss === 'number' && typeof trade.amount === 'number') {
            const drawdown = Math.abs(trade.profitLoss) / trade.amount;
            if (drawdown > this.maxDrawdown)
                this.maxDrawdown = drawdown;
        }
        this.tradeHistory.push(trade);
        if (this.totalTrades % 10 === 0)
            this.printSummary();
    }
    printSummary() {
        const avgPL = this.profitSum / (this.totalTrades || 1);
        const winRate = (this.wins / (this.totalTrades || 1)) * 100;
        const stdDev = Math.sqrt(this.profitSquares / (this.totalTrades || 1) - Math.pow(avgPL, 2));
        const sharpe = stdDev ? avgPL / stdDev : 0;
        const summary = {
            timestamp: new Date().toISOString(),
            totalTrades: this.totalTrades,
            winRate: winRate.toFixed(2),
            avgPL: avgPL.toFixed(4),
            maxDrawdown: this.maxDrawdown.toFixed(4),
            sharpe: sharpe.toFixed(4),
            bestTrade: this.bestTrade ? this.bestTrade.profitLoss?.toFixed(4) : '',
            worstTrade: this.worstTrade ? this.worstTrade.profitLoss?.toFixed(4) : '',
        };
        console.log('[TradeSimulator] SUMMARY:', summary);
        tradeLogger.logSummary(summary);
    }
    logMissedOpportunity(token, reason) {
        tradeLogger.log({
            timestamp: new Date().toISOString(),
            action: 'skip',
            token,
            price: 0,
            reason,
            success: false,
        });
    }
    positions = new Map();
    priceFeed;
    maxPositionSize;
    TRAILING_STOP_BASE = 0.05; // 5% base trailing stop
    MOMENTUM_MULTIPLIER = 0.01; // 1% per momentum unit
    VOLUME_WEIGHT = 0.3; // 30% weight for volume in position sizing
    PROFIT_STOP_LEVELS = {
        INITIAL: { profit: 10, tightening: 0.015, volumeThreshold: 50 },
        LEVEL1: { profit: 15, tightening: 0.025, volumeThreshold: 100 },
        LEVEL2: { profit: 25, tightening: 0.035, volumeThreshold: 200 },
        LEVEL3: { profit: 50, tightening: 0.045, volumeThreshold: 300 },
        LEVEL4: { profit: 75, tightening: 0.055, volumeThreshold: 400 },
    };
    MOMENTUM_THRESHOLDS = {
        WEAK: 20,
        MODERATE: 40,
        STRONG: 60,
        EXTREME: 80,
        CLIMAX: 95,
    };
    VOLUME_THRESHOLDS = {
        LOW_FLOAT: -70,
        DISTRIBUTION: -90,
        ACCUMULATION: -95,
        CLIMAX: 800,
        CASCADE: 400,
    };
    // Optimized profit protection thresholds for maximum profitability
    PROFIT_PROTECTION = {
        QUICK_SECURE: { profit: 12, take: 25, momentum: 30, volume: 40 }, // More aggressive early profit taking
        SOLID_LOCK: { profit: 20, take: 45, momentum: 15, volume: 80 }, // Earlier solid profit lock
        MAJOR_GAINS: { profit: 40, take: 75, momentum: 8, volume: 150 }, // Lower threshold for major gains
        MOON_BAG: { keep: 15 }, // Smaller moon bag for better protection
    };
    // Optimized institutional pattern thresholds
    PATTERN_THRESHOLDS = {
        RANGE_GAME: {
            duration: 2, // Faster pattern recognition
            volumeRange: 40, // Tighter volume range
            momentumRange: 25, // More sensitive momentum
            breakoutConfirmation: 1.08,
        },
        SMART_MONEY: {
            volumeDivergence: -25, // More sensitive to volume drops
            momentumDivergence: 15, // Quicker momentum divergence detection
            priceConfirmation: 1.03, // Lower confirmation threshold
        },
        LIQUIDITY_HUNT: {
            volumeSpike: 180, // Lower spike threshold
            momentumShift: 35, // More sensitive to shifts
            priceReversion: 0.97, // Earlier reversion detection
        },
        DARK_POOL: {
            volumeDrop: -70, // More sensitive volume drop
            accumulation: -85, // Earlier accumulation detection
            breakout: 1.12, // Lower breakout threshold
        },
    };
    // Enhanced pump detection thresholds with institutional patterns
    PUMP_THRESHOLDS = {
        STEALTH_PHASE: {
            volumeDrop: -80, // Extreme volume dry up
            volumeSpikes: 0, // No major volume spikes
            priceRange: 0.02, // Very tight price range
            timeframe: 3, // Bars to confirm stealth
        },
        EARLY_STAGE: {
            volumeDrop: -70, // Volume still low
            momentumBase: 15, // Initial momentum
            priceChange: 1.05, // 5% price change
            volumePattern: {
                minSpikes: 1, // Minimum volume spikes
                spikeThreshold: 150, // Volume spike size
            },
        },
        ACCELERATION: {
            volumeSpike: 200, // Higher volume requirement
            momentumRamp: 40, // Strong momentum
            priceVelocity: 1.15, // 15% quick move
            volumeProfile: {
                increasing: true, // Volume should be rising
                minTrend: 50, // Minimum volume trend
            },
        },
        FOMO_PHASE: {
            volumeClimax: 400, // Peak volume
            momentumPeak: 80, // Peak momentum
            priceTarget: 1.5, // 50% move target
            patterns: {
                volumeClimaxRatio: 3, // Volume vs average
                momentumThreshold: 70, // High momentum needed
                priceVelocity: 1.3, // Rapid price increase
            },
        },
        EXHAUSTION: {
            volumeFade: -30, // Volume decline
            momentumDrop: -20, // Momentum weakening
            priceStall: 0.98, // Price stalling
            patterns: {
                divergence: true, // Look for divergences
                volumeDistribution: true, // Check distribution
                momentumFailure: true, // Check momentum failure
            },
        },
    };
    // Optimized scaling strategy
    SCALING_STRATEGY = {
        ENTRY: {
            initial: 0.3, // 30% initial position
            scale1: 0.3, // 30% on first confirmation
            scale2: 0.4, // 40% on full confirmation
        },
        EXIT: {
            partial1: { profit: 20, size: 0.2 }, // 20% out at 20% profit
            partial2: { profit: 35, size: 0.3 }, // 30% out at 35% profit
            partial3: { profit: 50, size: 0.3 }, // 30% out at 50% profit
            runner: { size: 0.2 }, // Let 20% run
        },
    };
    position = null;
    constructor(priceFeed, maxPositionSize) {
        this.priceFeed = priceFeed;
        this.maxPositionSize = maxPositionSize;
    }
    async executeTrade(tokenAddress, usdAmount, side) {
        if (!tokenAddress || !usdAmount || !side) {
            return false;
        }
        // Get current price safely
        const currentPrice = this.priceFeed.getPrice(tokenAddress);
        if (typeof currentPrice !== 'number' || currentPrice <= 0) {
            return false;
        }
        // Calculate token amount based on USD value
        const tokenAmount = usdAmount / currentPrice;
        // Create trade object with proper type checking
        const trade = {
            id: uuidv4(),
            type: side,
            tokenAddress,
            amount: tokenAmount,
            timestamp: new Date(),
        };
        // Update position based on trade
        if (side === 'BUY') {
            const position = this.positions.get(tokenAddress) ?? {
                tokenAddress,
                tokenAmount: 0,
                usdAmount: 0,
                entryPrice: currentPrice,
                currentPrice,
                lastUpdate: Date.now(),
                highestPrice: currentPrice,
                trailingStop: currentPrice * (1 - this.TRAILING_STOP_BASE),
                peakMomentum: 0,
                partialTakeProfit: {
                    level1Taken: false,
                    level2Taken: false,
                    level3Taken: false,
                },
                recentHighs: [],
                amount: 0,
                pumpPhase: undefined,
                profitTaking: {
                    level1Taken: false,
                    level2Taken: false,
                    level3Taken: false,
                },
            };
            position.tokenAmount += tokenAmount;
            position.usdAmount += usdAmount;
            this.positions.set(tokenAddress, position);
        }
        else {
            const position = this.positions.get(tokenAddress);
            if (!position) {
                return false;
            }
            // Update position for sell
            position.tokenAmount = Math.max(0, position.tokenAmount - tokenAmount);
            position.usdAmount = Math.max(0, position.usdAmount - usdAmount);
            // Remove position if fully sold
            if (position.tokenAmount === 0) {
                this.positions.delete(tokenAddress);
            }
            else {
                this.positions.set(tokenAddress, position);
            }
        }
        return true;
    }
    calculateStopDistance(price, entryPrice, momentum, volumeProfile) {
        if (!price || !entryPrice || price <= 0 || entryPrice <= 0) {
            return this.TRAILING_STOP_BASE; // Return default if invalid inputs
        }
        // Calculate base stop distance
        let stopDistance = this.TRAILING_STOP_BASE;
        // Adjust for momentum
        const momentumFactor = Math.max(0, Math.min(momentum * this.MOMENTUM_MULTIPLIER, 0.05));
        stopDistance += momentumFactor;
        // Adjust for volume
        if (volumeProfile && typeof volumeProfile.volumeTrend === 'number') {
            const volumeFactor = Math.max(0, Math.min((volumeProfile.volumeTrend * this.VOLUME_WEIGHT) / 1000, 0.05));
            stopDistance += volumeFactor;
        }
        // Profit-based adjustments
        const profitPercent = ((price - entryPrice) / entryPrice) * 100;
        if (profitPercent >= 50) {
            stopDistance *= 0.6; // Tighter stop at higher profits
        }
        else if (profitPercent >= 25) {
            stopDistance *= 0.8;
        }
        // Ensure minimum and maximum bounds
        return Math.max(0.02, Math.min(stopDistance, 0.15));
    }
    determinePatternType(patterns) {
        // Ensure patterns object exists
        if (!patterns)
            return 'UNKNOWN';
        // Use type-safe pattern matching
        if (patterns.volumeDryUp && patterns.tightRange) {
            return 'ACCUMULATION';
        }
        if (patterns.peakingVolume && patterns.strongMomentum) {
            return 'CLIMAX';
        }
        if (patterns.volumeDistribution && patterns.momentumDivergence) {
            return 'DISTRIBUTION';
        }
        if (patterns.risingVolume && patterns.volumeSpikes > 0) {
            return 'MOMENTUM';
        }
        return 'UNKNOWN';
    }
    getPositionValue(tokenAddress) {
        const position = this.positions.get(tokenAddress);
        if (!position)
            return 0;
        return position.tokenAmount * (position.currentPrice ?? 0);
    }
    getMaxDrawdown(tokenAddress) {
        const position = this.positions.get(tokenAddress);
        if (!position)
            return 0;
        const peak = position.highestPrice;
        const current = position.currentPrice;
        return ((peak - current) / peak) * 100;
    }
    getProfitFactor(tokenAddress) {
        const position = this.positions.get(tokenAddress);
        if (!position)
            return 0;
        const currentValue = this.getPositionValue(tokenAddress);
        const profitPercent = ((currentValue - position.usdAmount) / position.usdAmount) * 100;
        const drawdown = this.getMaxDrawdown(tokenAddress);
        return profitPercent / Math.max(drawdown, 1);
    }
    getPosition(tokenAddress) {
        return this.positions.get(tokenAddress) || null;
    }
}
import { mockPriceFeed } from './utils/mockPriceFeed.js';
export const tradeSimulator = new TradeSimulator(mockPriceFeed, 1000);
//# sourceMappingURL=tradeSimulator.js.map