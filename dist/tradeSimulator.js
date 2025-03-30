"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tradeSimulator = exports.TradeSimulator = exports.TradeType = void 0;
const mockPriceFeed_1 = require("./utils/mockPriceFeed");
// Trade types
var TradeType;
(function (TradeType) {
    TradeType["BUY"] = "BUY";
    TradeType["SELL"] = "SELL";
})(TradeType || (exports.TradeType = TradeType = {}));
class TradeSimulator {
    constructor(priceFeed, maxPositionSize) {
        this.positions = new Map();
        this.TRAILING_STOP_BASE = 0.05; // 5% base trailing stop
        this.MOMENTUM_MULTIPLIER = 0.01; // 1% per momentum unit
        this.VOLUME_WEIGHT = 0.3; // 30% weight for volume in position sizing
        this.PROFIT_STOP_LEVELS = {
            INITIAL: { profit: 10, tightening: 0.015, volumeThreshold: 50 },
            LEVEL1: { profit: 15, tightening: 0.025, volumeThreshold: 100 },
            LEVEL2: { profit: 25, tightening: 0.035, volumeThreshold: 200 },
            LEVEL3: { profit: 50, tightening: 0.045, volumeThreshold: 300 },
            LEVEL4: { profit: 75, tightening: 0.055, volumeThreshold: 400 }
        };
        this.MOMENTUM_THRESHOLDS = {
            WEAK: 20,
            MODERATE: 40,
            STRONG: 60,
            EXTREME: 80,
            CLIMAX: 95
        };
        this.VOLUME_THRESHOLDS = {
            LOW_FLOAT: -70,
            DISTRIBUTION: -90,
            ACCUMULATION: -95,
            CLIMAX: 800,
            CASCADE: 400
        };
        // Optimized profit protection thresholds for maximum profitability
        this.PROFIT_PROTECTION = {
            QUICK_SECURE: { profit: 12, take: 25, momentum: 30, volume: 40 }, // More aggressive early profit taking
            SOLID_LOCK: { profit: 20, take: 45, momentum: 15, volume: 80 }, // Earlier solid profit lock
            MAJOR_GAINS: { profit: 40, take: 75, momentum: 8, volume: 150 }, // Lower threshold for major gains
            MOON_BAG: { keep: 15 } // Smaller moon bag for better protection
        };
        // Optimized institutional pattern thresholds
        this.PATTERN_THRESHOLDS = {
            RANGE_GAME: {
                duration: 2, // Faster pattern recognition
                volumeRange: 40, // Tighter volume range
                momentumRange: 25, // More sensitive momentum
                breakoutConfirmation: 1.08
            },
            SMART_MONEY: {
                volumeDivergence: -25, // More sensitive to volume drops
                momentumDivergence: 15, // Quicker momentum divergence detection
                priceConfirmation: 1.03 // Lower confirmation threshold
            },
            LIQUIDITY_HUNT: {
                volumeSpike: 180, // Lower spike threshold
                momentumShift: 35, // More sensitive to shifts
                priceReversion: 0.97 // Earlier reversion detection
            },
            DARK_POOL: {
                volumeDrop: -70, // More sensitive volume drop
                accumulation: -85, // Earlier accumulation detection
                breakout: 1.12 // Lower breakout threshold
            }
        };
        // Enhanced pump detection thresholds with institutional patterns
        this.PUMP_THRESHOLDS = {
            STEALTH_PHASE: {
                volumeDrop: -80, // Extreme volume dry up
                volumeSpikes: 0, // No major volume spikes
                priceRange: 0.02, // Very tight price range
                timeframe: 3 // Bars to confirm stealth
            },
            EARLY_STAGE: {
                volumeDrop: -70, // Volume still low
                momentumBase: 15, // Initial momentum
                priceChange: 1.05, // 5% price change
                volumePattern: {
                    minSpikes: 1, // Minimum volume spikes
                    spikeThreshold: 150 // Volume spike size
                }
            },
            ACCELERATION: {
                volumeSpike: 200, // Higher volume requirement
                momentumRamp: 40, // Strong momentum
                priceVelocity: 1.15, // 15% quick move
                volumeProfile: {
                    increasing: true, // Volume should be rising
                    minTrend: 50 // Minimum volume trend
                }
            },
            FOMO_PHASE: {
                volumeClimax: 400, // Peak volume
                momentumPeak: 80, // Peak momentum
                priceTarget: 1.5, // 50% move target
                patterns: {
                    volumeClimaxRatio: 3, // Volume vs average
                    momentumThreshold: 70, // High momentum needed
                    priceVelocity: 1.3 // Rapid price increase
                }
            },
            EXHAUSTION: {
                volumeFade: -30, // Volume decline
                momentumDrop: -20, // Momentum weakening
                priceStall: 0.98, // Price stalling
                patterns: {
                    divergence: true, // Look for divergences
                    volumeDistribution: true, // Check distribution
                    momentumFailure: true // Check momentum failure
                }
            }
        };
        // Optimized scaling strategy
        this.SCALING_STRATEGY = {
            ENTRY: {
                initial: 0.3, // 30% initial position
                scale1: 0.3, // 30% on first confirmation
                scale2: 0.4 // 40% on full confirmation
            },
            EXIT: {
                partial1: { profit: 20, size: 0.2 }, // 20% out at 20% profit
                partial2: { profit: 35, size: 0.3 }, // 30% out at 35% profit
                partial3: { profit: 50, size: 0.3 }, // 30% out at 50% profit
                runner: { size: 0.2 } // Let 20% run
            }
        };
        this.position = null;
        this.priceFeed = priceFeed;
        this.maxPositionSize = maxPositionSize;
    }
    async executeTrade(tokenAddress, usdAmount, side) {
        const currentPrice = this.priceFeed.getPrice(tokenAddress);
        if (!currentPrice)
            return false;
        if (side === 'BUY') {
            const volumeProfile = this.priceFeed.getVolumeProfile(tokenAddress);
            // Scale position size based on volume strength
            const volumeStrength = Math.max(0, (volumeProfile.volumeTrend + 100) / 200); // Normalize to 0-1
            const scaledAmount = usdAmount * (1 + (volumeStrength * this.VOLUME_WEIGHT));
            const finalAmount = Math.min(scaledAmount, this.maxPositionSize);
            const tokenAmount = finalAmount / currentPrice;
            const position = {
                tokenAddress,
                tokenAmount,
                usdAmount: finalAmount,
                entryPrice: currentPrice,
                currentPrice,
                lastUpdate: Date.now(),
                highestPrice: currentPrice,
                trailingStop: currentPrice * (1 - this.TRAILING_STOP_BASE),
                peakMomentum: 0,
                partialTakeProfit: {
                    level1Taken: false,
                    level2Taken: false,
                    level3Taken: false
                },
                recentHighs: [],
                amount: 1,
                pumpPhase: undefined,
                profitTaking: {
                    level1Taken: false,
                    level2Taken: false,
                    level3Taken: false
                }
            };
            this.positions.set(tokenAddress, position);
            this.position = position;
            return true;
        }
        else {
            this.positions.delete(tokenAddress);
            this.position = null;
            return true;
        }
    }
    calculateStopDistance(price, entryPrice, momentum, volumeProfile) {
        const profitPercent = ((price - entryPrice) / entryPrice) * 100;
        const momentumFactor = Math.max(0, momentum / 100);
        const volumeStrength = Math.max(0, (volumeProfile.volumeTrend + 100) / 200);
        // Enhanced base stop with dynamic institutional adjustment
        let stopDistance = this.TRAILING_STOP_BASE * (1 - momentumFactor * 0.8);
        // Progressive stop tightening with volume confirmation
        if (profitPercent >= this.PROFIT_STOP_LEVELS.LEVEL4.profit) {
            stopDistance *= 0.45; // 55% tighter at moon shot levels
            stopDistance += this.PROFIT_STOP_LEVELS.LEVEL4.tightening;
            if (volumeProfile.volumeTrend > this.PROFIT_STOP_LEVELS.LEVEL4.volumeThreshold) {
                stopDistance *= 0.9; // Additional 10% tightening on high volume
            }
        }
        else if (profitPercent >= this.PROFIT_STOP_LEVELS.LEVEL3.profit) {
            stopDistance *= 0.55; // 45% tighter at major profit
            stopDistance += this.PROFIT_STOP_LEVELS.LEVEL3.tightening;
            if (volumeProfile.volumeTrend > this.PROFIT_STOP_LEVELS.LEVEL3.volumeThreshold) {
                stopDistance *= 0.9;
            }
        }
        else if (profitPercent >= this.PROFIT_STOP_LEVELS.LEVEL2.profit) {
            stopDistance *= 0.65; // 35% tighter at solid profit
            stopDistance += this.PROFIT_STOP_LEVELS.LEVEL2.tightening;
            if (volumeProfile.volumeTrend > this.PROFIT_STOP_LEVELS.LEVEL2.volumeThreshold) {
                stopDistance *= 0.9;
            }
        }
        else if (profitPercent >= this.PROFIT_STOP_LEVELS.LEVEL1.profit) {
            stopDistance *= 0.75; // 25% tighter at first target
            stopDistance += this.PROFIT_STOP_LEVELS.LEVEL1.tightening;
            if (volumeProfile.volumeTrend > this.PROFIT_STOP_LEVELS.LEVEL1.volumeThreshold) {
                stopDistance *= 0.9;
            }
        }
        else if (profitPercent >= this.PROFIT_STOP_LEVELS.INITIAL.profit) {
            stopDistance *= 0.85; // 15% tighter at initial profit
            stopDistance += this.PROFIT_STOP_LEVELS.INITIAL.tightening;
            if (volumeProfile.volumeTrend > this.PROFIT_STOP_LEVELS.INITIAL.volumeThreshold) {
                stopDistance *= 0.9;
            }
        }
        // Enhanced institutional pattern protection
        if (volumeProfile.volumeTrend < this.VOLUME_THRESHOLDS.LOW_FLOAT && momentum > this.MOMENTUM_THRESHOLDS.MODERATE) {
            stopDistance *= 0.55; // 45% tighter on low float pumps
        }
        // Enhanced distribution detection
        if (volumeProfile.volumeTrend < this.VOLUME_THRESHOLDS.DISTRIBUTION && momentum > this.MOMENTUM_THRESHOLDS.STRONG) {
            stopDistance *= 0.5; // 50% tighter on potential distribution
        }
        // Enhanced accumulation detection
        if (volumeProfile.volumeTrend < this.VOLUME_THRESHOLDS.ACCUMULATION && momentum < this.MOMENTUM_THRESHOLDS.WEAK) {
            stopDistance *= 0.8; // 20% tighter during accumulation
        }
        // Enhanced momentum shift protection with volume confirmation
        const momentumPeak = Math.max(this.MOMENTUM_THRESHOLDS.STRONG, momentum);
        const momentumDrop = momentumPeak - momentum;
        if (momentumDrop > this.MOMENTUM_THRESHOLDS.WEAK) {
            const profitScale = Math.min(1, profitPercent / 50);
            const momentumTightening = Math.min(0.05, momentumDrop * 0.003) * (1 + profitScale);
            stopDistance *= (1 - momentumTightening);
        }
        // Enhanced cascade protection
        if (volumeProfile.volumeTrend > this.VOLUME_THRESHOLDS.CASCADE && momentum < -this.MOMENTUM_THRESHOLDS.MODERATE) {
            stopDistance *= 0.6; // 40% tighter during cascades
        }
        // Dynamic minimum stop based on market conditions
        const minStop = profitPercent >= 50 ? 0.01 :
            profitPercent >= 25 ? 0.012 :
                profitPercent >= 15 ? 0.015 : 0.02;
        // Enhanced extreme condition handling
        if (Math.abs(momentum) > this.MOMENTUM_THRESHOLDS.STRONG || volumeProfile.volumeTrend > this.VOLUME_THRESHOLDS.CASCADE) {
            stopDistance *= 0.7; // 30% tighter in extreme conditions
        }
        // Enhanced climax protection
        if (volumeProfile.volumeTrend > this.VOLUME_THRESHOLDS.CLIMAX && Math.abs(momentum) > this.MOMENTUM_THRESHOLDS.CLIMAX) {
            stopDistance *= 0.5; // 50% tighter on climax
        }
        return Math.max(minStop, stopDistance);
    }
    checkPumpPattern(position, price, momentum, volumeProfile) {
        // Track pattern history
        if (!position.patternHistory) {
            position.patternHistory = {
                volumeSpikes: [],
                momentumPeaks: [],
                priceSwings: [],
                timeInPhase: 0
            };
        }
        // Update pattern history
        position.patternHistory.volumeSpikes.push(volumeProfile.volumeTrend);
        position.patternHistory.momentumPeaks.push(momentum);
        position.patternHistory.priceSwings.push(price);
        position.patternHistory.timeInPhase++;
        // Keep last 5 data points
        if (position.patternHistory.volumeSpikes.length > 5) {
            position.patternHistory.volumeSpikes.shift();
            position.patternHistory.momentumPeaks.shift();
            position.patternHistory.priceSwings.shift();
        }
        // Analyze patterns
        const patterns = this.analyzePatterns(position.patternHistory, price, momentum, volumeProfile);
        // Stealth phase detection
        const stealthPhase = patterns.volumeDryUp &&
            patterns.tightRange &&
            patterns.lowVolatility &&
            position.patternHistory.timeInPhase >= this.PUMP_THRESHOLDS.STEALTH_PHASE.timeframe;
        // Early stage detection with improved pattern recognition
        const earlyStage = (volumeProfile.volumeTrend <= this.PUMP_THRESHOLDS.EARLY_STAGE.volumeDrop ||
            patterns.volumeSpikes >= this.PUMP_THRESHOLDS.EARLY_STAGE.volumePattern.minSpikes) &&
            momentum >= this.PUMP_THRESHOLDS.EARLY_STAGE.momentumBase &&
            price >= position.entryPrice * this.PUMP_THRESHOLDS.EARLY_STAGE.priceChange;
        // Acceleration phase with volume profile analysis
        const acceleration = volumeProfile.volumeTrend >= this.PUMP_THRESHOLDS.ACCELERATION.volumeSpike &&
            patterns.risingVolume &&
            momentum >= this.PUMP_THRESHOLDS.ACCELERATION.momentumRamp &&
            price >= position.entryPrice * this.PUMP_THRESHOLDS.ACCELERATION.priceVelocity;
        // FOMO phase with advanced pattern detection
        const fomoPhase = volumeProfile.volumeTrend >= this.PUMP_THRESHOLDS.FOMO_PHASE.volumeClimax &&
            patterns.volumeClimaxing &&
            momentum >= this.PUMP_THRESHOLDS.FOMO_PHASE.momentumPeak &&
            price >= position.entryPrice * this.PUMP_THRESHOLDS.FOMO_PHASE.priceTarget;
        // Exhaustion with multiple confirmation signals
        const exhaustion = (volumeProfile.volumeTrend <= this.PUMP_THRESHOLDS.EXHAUSTION.volumeFade ||
            patterns.volumeDistribution) &&
            (momentum <= this.PUMP_THRESHOLDS.EXHAUSTION.momentumDrop ||
                patterns.momentumDivergence) &&
            price <= position.highestPrice * this.PUMP_THRESHOLDS.EXHAUSTION.priceStall;
        // Position management based on detected phase
        if (stealthPhase && !position.pumpPhase) {
            position.amount *= (1 + this.SCALING_STRATEGY.ENTRY.initial);
            position.pumpPhase = 'stealth';
        }
        else if (earlyStage && position.pumpPhase === 'stealth') {
            position.amount *= (1 + this.SCALING_STRATEGY.ENTRY.scale1);
            position.pumpPhase = 'early';
        }
        else if (acceleration && position.pumpPhase === 'early') {
            position.amount *= (1 + this.SCALING_STRATEGY.ENTRY.scale2);
            position.pumpPhase = 'acceleration';
        }
        // Enhanced profit taking with pattern awareness
        if (fomoPhase) {
            if (!position.profitTaking.level1Taken && patterns.strongMomentum) {
                position.amount *= (1 - this.SCALING_STRATEGY.EXIT.partial1.size);
                position.profitTaking.level1Taken = true;
            }
            if (!position.profitTaking.level2Taken &&
                price >= position.entryPrice * (1 + this.SCALING_STRATEGY.EXIT.partial2.profit / 100) &&
                patterns.peakingVolume) {
                position.amount *= (1 - this.SCALING_STRATEGY.EXIT.partial2.size);
                position.profitTaking.level2Taken = true;
            }
            if (!position.profitTaking.level3Taken &&
                price >= position.entryPrice * (1 + this.SCALING_STRATEGY.EXIT.partial3.profit / 100) &&
                patterns.climaxing) {
                position.amount *= (1 - this.SCALING_STRATEGY.EXIT.partial3.size);
                position.profitTaking.level3Taken = true;
            }
        }
        // Exit on confirmed exhaustion
        if (exhaustion && position.pumpPhase === 'acceleration' && patterns.confirmed) {
            position.amount *= (1 - this.SCALING_STRATEGY.EXIT.runner.size);
            return true;
        }
        return false;
    }
    analyzePatterns(history, price, momentum, volumeProfile) {
        const recentVolume = history.volumeSpikes.slice(-3);
        const recentMomentum = history.momentumPeaks.slice(-3);
        const recentPrices = history.priceSwings.slice(-3);
        return {
            // Volume patterns
            volumeDryUp: Math.max(...recentVolume) < -70,
            volumeSpikes: recentVolume.filter((v) => v > 150).length,
            risingVolume: recentVolume[2] > recentVolume[1] && recentVolume[1] > recentVolume[0],
            volumeClimaxing: recentVolume[2] > 300 && recentVolume[2] > recentVolume[1] * 2,
            volumeDistribution: recentVolume[2] < recentVolume[1] && volumeProfile.volumeSpikes > 2,
            // Momentum patterns
            strongMomentum: momentum > 60 && momentum > Math.max(...recentMomentum.slice(0, -1)),
            momentumDivergence: price > Math.max(...recentPrices) && momentum < Math.max(...recentMomentum),
            peakingVolume: volumeProfile.volumeTrend > 200 && volumeProfile.volumeSpikes > 1,
            climaxing: momentum > 70 && volumeProfile.volumeTrend > 300,
            // Price patterns
            tightRange: (Math.max(...recentPrices) - Math.min(...recentPrices)) / Math.min(...recentPrices) < 0.03,
            lowVolatility: Math.max(...recentMomentum.map((m) => Math.abs(m))) < 20,
            // Confirmation signals
            confirmed: history.timeInPhase > 2 && volumeProfile.volumeSpikes > 1
        };
    }
    updatePrice(price, volumeProfile) {
        const momentum = this.calculateMomentum(price);
        // Create initial position if none exists
        if (!this.position) {
            this.position = this.createInitialPosition(price);
        }
        // Update position state
        this.position.currentPrice = price;
        this.position.lastUpdate = Date.now();
        // Check for entry signals
        const patterns = this.analyzePatterns(this.position.patternHistory || { volumeSpikes: [], momentumPeaks: [], priceSwings: [], timeInPhase: 0 }, price, momentum, volumeProfile);
        const confidence = this.calculatePatternConfidence(patterns);
        // If we're not in a trade and see a strong signal
        if (!this.position.entryPrice && confidence > 70) {
            this.position.entryPrice = price;
            return {
                type: 'Entry Signal',
                confidence,
                action: 'buy',
                patterns
            };
        }
        // If we're in a trade, check for exit
        if (this.position.entryPrice && this.checkExitConditions(this.position, price, momentum, volumeProfile)) {
            const exitResult = {
                type: 'Exit Signal',
                confidence: this.calculatePatternConfidence(patterns),
                action: 'sell',
                patterns
            };
            this.position = null;
            return exitResult;
        }
        return null;
    }
    createInitialPosition(price) {
        return {
            tokenAddress: '',
            tokenAmount: 0,
            usdAmount: 0,
            entryPrice: 0,
            currentPrice: price,
            lastUpdate: Date.now(),
            highestPrice: price,
            trailingStop: price * (1 - this.TRAILING_STOP_BASE),
            peakMomentum: 0,
            partialTakeProfit: {
                level1Taken: false,
                level2Taken: false,
                level3Taken: false
            },
            recentHighs: [],
            amount: 1,
            pumpPhase: undefined,
            profitTaking: {
                level1Taken: false,
                level2Taken: false,
                level3Taken: false
            }
        };
    }
    calculateMomentum(price) {
        // Implement momentum calculation logic here
        return 0;
    }
    updatePosition(price, volumeProfile) {
        if (!this.position)
            return;
        this.position.currentPrice = price;
        this.position.lastUpdate = Date.now();
        this.position.peakMomentum = Math.max(this.position.peakMomentum, this.calculateMomentum(price));
        // Get volume profile and market metrics
        const profitPercent = ((price - this.position.entryPrice) / this.position.entryPrice) * 100;
        const momentumChange = this.position.peakMomentum - this.calculateMomentum(price);
        // Update highest price and trailing stop
        if (price > this.position.highestPrice) {
            this.position.highestPrice = price;
            const stopDistance = this.calculateStopDistance(price, this.position.entryPrice, this.calculateMomentum(price), volumeProfile);
            this.position.trailingStop = price * (1 - stopDistance);
        }
        // Check for pump pattern first
        if (this.checkPumpPattern(this.position, price, this.calculateMomentum(price), volumeProfile)) {
            this.positions.delete(this.position.tokenAddress);
            this.position = null;
            return;
        }
        // Dynamic stop adjustment based on market conditions
        const isVolatile = volumeProfile.volumeSpikes > 1 && Math.abs(this.calculateMomentum(price)) > 30;
        const isStrongMomentumShift = momentumChange > 20 && profitPercent > 15;
        const isWeakVolume = volumeProfile.volumeTrend < -20 && profitPercent > 10;
        if (isVolatile || isStrongMomentumShift || isWeakVolume) {
            // Calculate adaptive tightening factor
            let tighteningFactor = 0.8; // Base 20% tighter
            if (isVolatile)
                tighteningFactor *= 0.9; // Additional 10% for volatility
            if (isStrongMomentumShift)
                tighteningFactor *= 0.95; // 5% for momentum
            if (isWeakVolume)
                tighteningFactor *= 0.95; // 5% for weak volume
            const currentStopDistance = (price - this.position.trailingStop) / price;
            const adjustedDistance = currentStopDistance * tighteningFactor;
            const minStopDistance = profitPercent >= 50 ? 0.01 :
                profitPercent >= 25 ? 0.012 :
                    profitPercent >= 15 ? 0.015 : 0.02;
            this.position.trailingStop = price * (1 - Math.max(minStopDistance, adjustedDistance));
        }
        // Track recent highs for multi-wave pattern detection
        if (price > this.position.highestPrice * 0.98) {
            this.position.recentHighs.push(price);
            if (this.position.recentHighs.length > 3) {
                this.position.recentHighs.shift();
            }
        }
        // Enhanced exit conditions with momentum confirmation
        if (this.checkExitConditions(this.position, price, this.calculateMomentum(price), volumeProfile)) {
            this.positions.delete(this.position.tokenAddress);
            this.position = null;
            return;
        }
        // Handle profit taking with dynamic conditions
        this.handleProfitTaking(this.position, price, this.calculateMomentum(price), volumeProfile);
    }
    checkExitConditions(position, price, momentum, volumeProfile) {
        const profitPercent = ((price - position.entryPrice) / position.entryPrice) * 100;
        // Enhanced stop loss check with dynamic tolerance
        const stopTolerance = profitPercent >= 50 ? 0.003 :
            profitPercent >= 25 ? 0.002 :
                profitPercent >= 15 ? 0.001 : 0;
        if (price <= position.trailingStop * (1 + stopTolerance)) {
            return true;
        }
        // Enhanced momentum-based exits with institutional detection
        const momentumDrop = position.peakMomentum - momentum;
        const profitScale = Math.min(1, profitPercent / 50);
        // Enhanced thresholds based on profit level and volume
        const momentumThreshold = this.MOMENTUM_THRESHOLDS.MODERATE - (15 * profitScale);
        const isCriticalMomentumLoss = momentumDrop > momentumThreshold && profitPercent > 15;
        // Enhanced volume confirmation
        const isHighVolume = volumeProfile.volumeTrend > this.VOLUME_THRESHOLDS.CASCADE / 2;
        const hasVolumeDivergence = price > position.highestPrice * 0.98 && volumeProfile.volumeTrend < -this.MOMENTUM_THRESHOLDS.WEAK;
        const isVolumeClimaxing = volumeProfile.volumeSpikes > 2 && momentum < 0;
        // Enhanced extreme market condition checks
        const isExtremeMomentum = Math.abs(momentum) > this.MOMENTUM_THRESHOLDS.EXTREME;
        const isExtremeVolume = volumeProfile.volumeTrend > this.VOLUME_THRESHOLDS.CASCADE;
        const hasLiquidityCrisis = volumeProfile.volumeTrend < this.VOLUME_THRESHOLDS.LOW_FLOAT && momentum < -this.MOMENTUM_THRESHOLDS.MODERATE;
        // Enhanced institutional pattern detection
        const isStopHunt = volumeProfile.volumeTrend > this.VOLUME_THRESHOLDS.CASCADE && momentum < -this.MOMENTUM_THRESHOLDS.STRONG;
        const isWhaleDistribution = volumeProfile.volumeTrend > this.VOLUME_THRESHOLDS.CLIMAX && momentum > this.MOMENTUM_THRESHOLDS.STRONG;
        const isMultiWaveTrap = momentum > this.MOMENTUM_THRESHOLDS.MODERATE && volumeProfile.volumeTrend < -this.MOMENTUM_THRESHOLDS.WEAK &&
            position.recentHighs.length >= 2 &&
            position.recentHighs[position.recentHighs.length - 1] < position.recentHighs[position.recentHighs.length - 2];
        // Enhanced pattern detection
        const isRangeBreakTrap = momentum > this.MOMENTUM_THRESHOLDS.MODERATE && volumeProfile.volumeTrend < -this.MOMENTUM_THRESHOLDS.WEAK &&
            price > position.highestPrice * 1.1;
        const isLowFloatPump = volumeProfile.volumeTrend < this.VOLUME_THRESHOLDS.LOW_FLOAT && momentum > this.MOMENTUM_THRESHOLDS.STRONG;
        const isLiquidityCascade = volumeProfile.volumeTrend > this.VOLUME_THRESHOLDS.CASCADE && momentum < -this.MOMENTUM_THRESHOLDS.MODERATE &&
            position.recentHighs.length >= 2;
        // Combined exit signals with enhanced sensitivity
        return (isCriticalMomentumLoss && isHighVolume) ||
            (hasVolumeDivergence && momentum < -this.MOMENTUM_THRESHOLDS.WEAK * profitScale) ||
            (isVolumeClimaxing && profitPercent > 25) ||
            (isExtremeMomentum && isExtremeVolume) ||
            hasLiquidityCrisis ||
            isStopHunt ||
            isWhaleDistribution ||
            isMultiWaveTrap ||
            isRangeBreakTrap ||
            isLowFloatPump ||
            isLiquidityCascade;
    }
    handleProfitTaking(position, price, momentum, volumeProfile) {
        const profitPercent = ((price - position.entryPrice) / position.entryPrice) * 100;
        let reductionAmount = 0;
        // Level 1: Quick secure at 15%
        if (!position.profitTaking.level1Taken && profitPercent >= 15) {
            const isWeakening = momentum < 35 || momentum < position.peakMomentum * 0.7;
            if (isWeakening || volumeProfile.volumeTrend < -10) {
                reductionAmount = 0.3;
                position.profitTaking.level1Taken = true;
            }
        }
        // Level 2: Lock gains at 25%
        if (!position.profitTaking.level2Taken && profitPercent >= 25) {
            const isStrongSignal = momentum < 20 || (momentum < position.peakMomentum * 0.6);
            if (isStrongSignal || volumeProfile.volumeSpikes > 1) {
                reductionAmount = 0.5;
                position.profitTaking.level2Taken = true;
            }
        }
        // Level 3: Major profit at 50%
        if (!position.profitTaking.level3Taken && profitPercent >= 50) {
            const isReversal = momentum < 10 || (momentum < position.peakMomentum * 0.5);
            if (isReversal || volumeProfile.volumeTrend < 0) {
                reductionAmount = 0.8;
                position.profitTaking.level3Taken = true;
            }
        }
        // Apply position reduction if needed
        if (reductionAmount > 0) {
            const remainingTokens = position.tokenAmount * (1 - reductionAmount);
            position.tokenAmount = remainingTokens;
            position.usdAmount = (position.usdAmount * remainingTokens) / position.tokenAmount;
        }
        // Enhanced profit protection
        if (this.checkProfitProtection(position, price, momentum, volumeProfile)) {
            this.positions.delete(position.tokenAddress);
            this.position = null;
        }
    }
    checkProfitProtection(position, price, momentum, volumeProfile) {
        const profitPercent = ((price - position.entryPrice) / position.entryPrice) * 100;
        // Enhanced profit taking with institutional pattern detection
        if (profitPercent >= this.PROFIT_PROTECTION.MAJOR_GAINS.profit) {
            // Major gains protection with smart money divergence check
            if (momentum < this.PROFIT_PROTECTION.MAJOR_GAINS.momentum ||
                this.detectSmartMoneyDivergence(position, price, momentum, volumeProfile)) {
                return this.takeProfits(position, this.PROFIT_PROTECTION.MAJOR_GAINS.take);
            }
        }
        else if (profitPercent >= this.PROFIT_PROTECTION.SOLID_LOCK.profit) {
            // Enhanced solid profit protection with range game detection
            if (momentum < this.PROFIT_PROTECTION.SOLID_LOCK.momentum ||
                this.detectRangeGameDistribution(position, price, momentum, volumeProfile)) {
                return this.takeProfits(position, this.PROFIT_PROTECTION.SOLID_LOCK.take);
            }
        }
        else if (profitPercent >= this.PROFIT_PROTECTION.QUICK_SECURE.profit) {
            // Quick profit protection with liquidity hunt detection
            if (momentum < this.PROFIT_PROTECTION.QUICK_SECURE.momentum ||
                this.detectLiquidityHunt(position, price, momentum, volumeProfile)) {
                return this.takeProfits(position, this.PROFIT_PROTECTION.QUICK_SECURE.take);
            }
        }
        // Enhanced moon bag protection
        if (this.detectDarkPoolDistribution(position, price, momentum, volumeProfile)) {
            return this.takeProfits(position, 100 - this.PROFIT_PROTECTION.MOON_BAG.keep);
        }
        return false;
    }
    detectSmartMoneyDivergence(position, price, momentum, volumeProfile) {
        const priceHigher = price > position.highestPrice * this.PATTERN_THRESHOLDS.SMART_MONEY.priceConfirmation;
        const volumeLower = volumeProfile.volumeTrend < this.PATTERN_THRESHOLDS.SMART_MONEY.volumeDivergence;
        const momentumWeaker = momentum < position.peakMomentum - this.PATTERN_THRESHOLDS.SMART_MONEY.momentumDivergence;
        return priceHigher && volumeLower && momentumWeaker;
    }
    detectRangeGameDistribution(position, price, momentum, volumeProfile) {
        const inRange = Math.abs(volumeProfile.volumeTrend) < this.PATTERN_THRESHOLDS.RANGE_GAME.volumeRange;
        const momentumContained = Math.abs(momentum) < this.PATTERN_THRESHOLDS.RANGE_GAME.momentumRange;
        const priceBreakout = price > position.highestPrice * this.PATTERN_THRESHOLDS.RANGE_GAME.breakoutConfirmation;
        const sufficientDuration = position.recentHighs.length >= this.PATTERN_THRESHOLDS.RANGE_GAME.duration;
        return inRange && momentumContained && priceBreakout && sufficientDuration;
    }
    detectLiquidityHunt(position, price, momentum, volumeProfile) {
        const hasVolumeSpike = volumeProfile.volumeTrend > this.PATTERN_THRESHOLDS.LIQUIDITY_HUNT.volumeSpike;
        const hasMomentumShift = Math.abs(momentum - position.peakMomentum) > this.PATTERN_THRESHOLDS.LIQUIDITY_HUNT.momentumShift;
        const priceReverted = price < position.highestPrice * this.PATTERN_THRESHOLDS.LIQUIDITY_HUNT.priceReversion;
        return hasVolumeSpike && hasMomentumShift && priceReverted;
    }
    detectDarkPoolDistribution(position, price, momentum, volumeProfile) {
        const hasVolumeDrop = volumeProfile.volumeTrend < this.PATTERN_THRESHOLDS.DARK_POOL.volumeDrop;
        const hasAccumulation = volumeProfile.volumeTrend < this.PATTERN_THRESHOLDS.DARK_POOL.accumulation;
        const priceBreakout = price > position.highestPrice * this.PATTERN_THRESHOLDS.DARK_POOL.breakout;
        return hasVolumeDrop && hasAccumulation && priceBreakout;
    }
    takeProfits(position, percentage) {
        position.amount *= (1 - percentage / 100);
        return position.amount <= 0;
    }
    calculatePatternConfidence(patterns) {
        let score = 0;
        if (patterns.volumeDryUp)
            score += 15;
        if (patterns.volumeSpikes > 1)
            score += 20;
        if (patterns.risingVolume)
            score += 15;
        if (patterns.volumeClimaxing)
            score += 25;
        if (patterns.strongMomentum)
            score += 15;
        if (!patterns.momentumDivergence)
            score += 10;
        return Math.min(100, score);
    }
    getPositionValue(tokenAddress) {
        const position = this.positions.get(tokenAddress);
        if (!position)
            return 0;
        return position.tokenAmount * position.currentPrice;
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
exports.TradeSimulator = TradeSimulator;
exports.tradeSimulator = new TradeSimulator(new mockPriceFeed_1.MockPriceFeed(), 1000);
