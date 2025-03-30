"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternBacktester = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Pattern Backtester
 * Tests pattern detection strategies against historical price data
 */
class PatternBacktester {
    constructor(config) {
        this.priceData = [];
        this.patternDetector = null;
        this.results = {};
        // Default strategy parameters (can be made configurable later)
        this.defaultStopLossPercent = -5;
        this.defaultTakeProfitPercent = 15;
        this.defaultMaxHoldingTimeHours = 4;
        this.config = {
            priceDataPath: './data/historical',
            saveResults: true,
            ...config
        };
        // Initialize results for each pattern
        const patterns = this.config.patternTypes || [
            'Mega Pump and Dump',
            'Volatility Squeeze',
            'Smart Money Trap',
            'Algorithmic Stop Hunt',
            'Smart Money Reversal'
        ];
        patterns.forEach(pattern => {
            this.results[pattern] = {
                patternName: pattern,
                detectionCount: 0,
                winCount: 0,
                lossCount: 0,
                winRate: 0,
                avgReturn: 0,
                maxReturn: 0,
                maxDrawdown: 0,
                avgHoldingTimeHours: 0,
                profitFactor: 0,
                trades: []
            };
        });
    }
    /**
     * Load historical price data
     */
    async loadPriceData() {
        try {
            const tokenAddress = this.config.tokenAddress;
            // Try to load data from file
            const dataDir = this.config.priceDataPath || './data/historical';
            const filePath = path.join(dataDir, `${tokenAddress}.json`);
            if (fs.existsSync(filePath)) {
                logger_1.default.info(`Loading price data from file: ${filePath}`);
                const fileData = fs.readFileSync(filePath, 'utf8');
                this.priceData = JSON.parse(fileData);
            }
            else {
                // In a real implementation, you would fetch historical data
                // from an API or other data source
                logger_1.default.warn(`Price data file not found: ${filePath}`);
                return false;
            }
            // Filter by timestamp range
            if (this.config.startTimestamp && this.config.endTimestamp) {
                this.priceData = this.priceData.filter(p => p.timestamp >= this.config.startTimestamp &&
                    p.timestamp <= this.config.endTimestamp);
            }
            logger_1.default.info(`Loaded ${this.priceData.length} price data points for token ${tokenAddress}`);
            return this.priceData.length > 0;
        }
        catch (error) {
            logger_1.default.error('Error loading price data', error);
            return false;
        }
    }
    /**
     * Run backtest for all selected patterns
     */
    async runBacktest() {
        try {
            logger_1.default.info('Starting pattern backtest...');
            if (this.priceData.length === 0) {
                const loaded = await this.loadPriceData();
                if (!loaded) {
                    throw new Error('No price data available for backtest');
                }
            }
            // Chronologically process each price point
            for (let i = 0; i < this.priceData.length; i++) {
                const currentPoint = this.priceData[i];
                // Need at least 5 data points to establish a pattern
                if (i < 5)
                    continue;
                // Create a simulated market state for pattern detection
                const simulatedToken = this.createSimulatedToken(i);
                // Detect patterns
                const detectedPatterns = this.detectPatterns(simulatedToken);
                // For each detected pattern, simulate trading
                for (const pattern of detectedPatterns) {
                    this.simulateTrade(pattern, i);
                }
            }
            // Calculate final statistics
            this.calculateResults();
            // Save results if configured
            if (this.config.saveResults) {
                this.saveResults();
            }
            logger_1.default.info('Backtest completed', {
                token: this.config.tokenAddress,
                patterns: Object.keys(this.results).length
            });
            return this.results;
        }
        catch (error) {
            logger_1.default.error('Error running backtest', error);
            return this.results;
        }
    }
    /**
     * Create a simulated token for pattern detection
     */
    createSimulatedToken(index) {
        // Get current and previous price points
        const currentPoint = this.priceData[index];
        const prevPoints = this.priceData.slice(Math.max(0, index - 5), index);
        // Calculate buy ratio based on current point
        const buyRatio = currentPoint.buys / (currentPoint.sells || 1);
        // Calculate volume change
        const prevVolume = prevPoints.length > 0 ? prevPoints[prevPoints.length - 1].volume : 0;
        const volumeChange = prevVolume > 0 ?
            ((currentPoint.volume - prevVolume) / prevVolume) * 100 : 0;
        // Create simulated token object similar to what token discovery provides
        return {
            address: this.config.tokenAddress,
            symbol: 'SIMTOKEN',
            name: 'Simulated Token',
            price: currentPoint.price,
            liquidity: currentPoint.liquidity,
            volume24h: currentPoint.volume * 24, // Simulate 24h volume
            buyRatio,
            buys5min: currentPoint.buys,
            sells5min: currentPoint.sells,
            volumeChange,
            age: 12, // Fixed simulated age (12 hours)
            isNew: true,
            score: 70, // Simulated discovery score
            timestamp: currentPoint.timestamp,
            priceHistory: prevPoints.map(p => p.price).concat(currentPoint.price)
        };
    }
    /**
     * Detect patterns based on current market state
     */
    detectPatterns(token) {
        // In a real implementation, you would use the actual PatternDetector
        // Here we'll simulate pattern detection logic
        const patterns = [];
        const patternTypes = this.config.patternTypes || [
            'Mega Pump and Dump',
            'Volatility Squeeze',
            'Smart Money Trap',
            'Algorithmic Stop Hunt',
            'Smart Money Reversal'
        ];
        for (const patternType of patternTypes) {
            const confidence = this.simulatePatternConfidence(token, patternType);
            if (confidence >= 65) { // Minimum confidence threshold
                patterns.push({
                    pattern: patternType,
                    confidence,
                    signalType: 'buy'
                });
                // Record detection in results
                this.results[patternType].detectionCount++;
            }
        }
        return patterns;
    }
    /**
     * Simulate pattern confidence calculation
     */
    simulatePatternConfidence(token, patternType) {
        // This is a simplified simulation of pattern detection
        // In a real implementation, you would use actual pattern detection algorithms
        switch (patternType) {
            case 'Mega Pump and Dump':
                return token.buyRatio > 1.5 && token.volumeChange > 80 ? 85 : 40;
            case 'Volatility Squeeze':
                // Check for low volatility followed by breakout
                if (token.priceHistory && token.priceHistory.length >= 5) {
                    const prices = token.priceHistory.slice(-5);
                    const mean = prices.slice(0, 4).reduce((sum, p) => sum + p, 0) / 4;
                    const variance = prices.slice(0, 4)
                        .reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / 4;
                    const stdDev = Math.sqrt(variance);
                    return (stdDev / mean < 0.03 && prices[4] > prices[3] * 1.03) ? 75 : 30;
                }
                return 30;
            case 'Smart Money Trap':
                return token.buyRatio > 1.2 && token.liquidity > 80000 ? 70 : 35;
            case 'Algorithmic Stop Hunt':
                if (token.priceHistory && token.priceHistory.length >= 4) {
                    const prices = token.priceHistory.slice(-4);
                    const drop = ((prices[1] - prices[2]) / prices[1]) * 100;
                    const recovery = ((prices[3] - prices[2]) / prices[2]) * 100;
                    return (drop > 5 && recovery > 3) ? 80 : 25;
                }
                return 25;
            case 'Smart Money Reversal':
                if (token.priceHistory && token.priceHistory.length >= 5) {
                    const prices = token.priceHistory.slice(-5);
                    const trend1 = prices[1] - prices[0];
                    const trend2 = prices[2] - prices[1];
                    const trend3 = prices[3] - prices[2];
                    const trend4 = prices[4] - prices[3];
                    // Look for down-down-down-up pattern
                    return (trend1 < 0 && trend2 < 0 && trend3 < 0 && trend4 > 0) ? 70 : 20;
                }
                return 20;
            default:
                return 0;
        }
    }
    /**
     * Simulate trade execution and tracking
     */
    simulateTrade(pattern, startIndex) {
        try {
            // Skip if no data points after detection
            if (startIndex >= this.priceData.length - 1) {
                return;
            }
            const entryPrice = this.priceData[startIndex].price;
            const entryTime = this.priceData[startIndex].timestamp;
            // Convert stop loss and take profit to price levels using defaults
            const stopLossPrice = entryPrice * (1 + this.defaultStopLossPercent / 100);
            const takeProfitPrice = entryPrice * (1 + this.defaultTakeProfitPercent / 100);
            // Calculate max holding time in milliseconds using default
            const maxHoldingTime = this.defaultMaxHoldingTimeHours * 60 * 60 * 1000;
            const maxExitTime = entryTime + maxHoldingTime;
            let exitPrice = 0;
            let exitTime = 0;
            let exitReason = '';
            // Simulate trade through subsequent price points
            for (let i = startIndex + 1; i < this.priceData.length; i++) {
                const currentPoint = this.priceData[i];
                const currentPrice = currentPoint.price;
                const currentTime = currentPoint.timestamp;
                // Check for stop loss
                if (currentPrice <= stopLossPrice) {
                    exitPrice = currentPrice;
                    exitTime = currentTime;
                    exitReason = 'Stop Loss';
                    break;
                }
                // Check for take profit
                if (currentPrice >= takeProfitPrice) {
                    exitPrice = currentPrice;
                    exitTime = currentTime;
                    exitReason = 'Take Profit';
                    break;
                }
                // Check for max holding time
                if (currentTime >= maxExitTime) {
                    exitPrice = currentPrice;
                    exitTime = currentTime;
                    exitReason = 'Max Holding Time';
                    break;
                }
                // If no exit condition met, use the last price point
                if (i === this.priceData.length - 1) {
                    exitPrice = currentPrice;
                    exitTime = currentTime;
                    exitReason = 'End of Data';
                }
            }
            // Calculate PnL and holding time
            const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
            const holdingTimeHours = (exitTime - entryTime) / (1000 * 60 * 60);
            // Record the trade result
            const tradeResult = {
                timestamp: entryTime,
                entryPrice,
                exitPrice,
                holdingTimeHours,
                pnlPercent,
                exitReason
            };
            this.results[pattern.pattern].trades.push(tradeResult);
            this.results[pattern.pattern].detectionCount++;
            // Update win/loss counters
            if (pnlPercent > 0) {
                this.results[pattern.pattern].winCount++;
            }
            else if (pnlPercent < 0) {
                this.results[pattern.pattern].lossCount++;
            }
        }
        catch (error) {
            logger_1.default.error(`Error simulating trade for pattern ${pattern.pattern}:`, error);
        }
    }
    /**
     * Calculate final backtest results
     */
    calculateResults() {
        Object.values(this.results).forEach(result => {
            if (result.trades.length === 0) {
                return; // No trades for this pattern
            }
            let totalReturn = 0;
            let positiveReturns = 0;
            let negativeReturns = 0;
            let maxReturn = -Infinity;
            let maxDrawdown = 0;
            let peakValue = 1;
            let currentValue = 1;
            let totalHoldingTime = 0;
            let profitSum = 0;
            let lossSum = 0;
            result.trades.forEach(trade => {
                totalReturn += trade.pnlPercent;
                totalHoldingTime += trade.holdingTimeHours;
                if (trade.pnlPercent > 0) {
                    positiveReturns++;
                    profitSum += trade.pnlPercent;
                }
                else if (trade.pnlPercent < 0) {
                    negativeReturns++;
                    lossSum += Math.abs(trade.pnlPercent);
                }
                maxReturn = Math.max(maxReturn, trade.pnlPercent);
                // Calculate drawdown
                currentValue *= (1 + trade.pnlPercent / 100);
                peakValue = Math.max(peakValue, currentValue);
                const drawdown = (peakValue - currentValue) / peakValue;
                maxDrawdown = Math.max(maxDrawdown, drawdown);
            });
            result.detectionCount = result.trades.length;
            result.winRate = result.trades.length > 0 ? (positiveReturns / result.trades.length) * 100 : 0;
            result.avgReturn = result.trades.length > 0 ? totalReturn / result.trades.length : 0;
            result.avgHoldingTimeHours = result.trades.length > 0 ? totalHoldingTime / result.trades.length : 0;
            result.maxReturn = maxReturn === -Infinity ? 0 : maxReturn;
            result.maxDrawdown = maxDrawdown * 100;
            result.profitFactor = lossSum > 0 ? profitSum / lossSum : (profitSum > 0 ? Infinity : 0);
        });
    }
    /**
     * Save backtest results to file
     */
    saveResults() {
        try {
            const dataDir = this.config.priceDataPath || './data/historical';
            // Ensure directory exists
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            const filePath = path.join(dataDir, `backtest_${this.config.tokenAddress}_${timestamp}.json`);
            fs.writeFileSync(filePath, JSON.stringify(this.results, null, 2));
            logger_1.default.info(`Backtest results saved to ${filePath}`);
        }
        catch (error) {
            logger_1.default.error('Error saving backtest results', error);
        }
    }
    /**
     * Get summary of backtest results
     */
    getResultsSummary() {
        const summary = {
            token: this.config.tokenAddress,
            totalPatterns: Object.keys(this.results).length,
            totalTrades: 0,
            overallWinRate: 0,
            bestPattern: '',
            bestPatternReturn: 0,
            startTime: new Date(this.config.startTimestamp).toISOString(),
            endTime: new Date(this.config.endTimestamp).toISOString(),
            patterns: {}
        };
        let totalWins = 0;
        let totalTrades = 0;
        for (const patternName in this.results) {
            const result = this.results[patternName];
            // Skip patterns with no trades
            if (result.trades.length === 0)
                continue;
            // Add pattern summary
            summary.patterns[patternName] = {
                trades: result.trades.length,
                winRate: result.winRate.toFixed(2) + '%',
                avgReturn: result.avgReturn.toFixed(2) + '%',
                maxReturn: result.maxReturn.toFixed(2) + '%',
                maxDrawdown: result.maxDrawdown.toFixed(2) + '%',
                profitFactor: result.profitFactor.toFixed(2)
            };
            // Update totals
            totalWins += result.winCount;
            totalTrades += result.trades.length;
            // Check if this is the best pattern
            if (result.avgReturn > summary.bestPatternReturn) {
                summary.bestPattern = patternName;
                summary.bestPatternReturn = result.avgReturn;
            }
        }
        // Calculate overall win rate
        summary.totalTrades = totalTrades;
        summary.overallWinRate = totalTrades > 0 ?
            ((totalWins / totalTrades) * 100).toFixed(2) + '%' : '0%';
        summary.bestPatternReturn = summary.bestPatternReturn.toFixed(2) + '%';
        return summary;
    }
}
exports.PatternBacktester = PatternBacktester;
exports.default = PatternBacktester;
