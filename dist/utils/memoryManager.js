"use strict";
/**
 * Memory Manager - Utilities for monitoring and managing memory usage
 *
 * This module helps track memory usage and provides tools to reduce memory pressure
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryManager = exports.MemoryManager = void 0;
exports.diagnoseMemory = diagnoseMemory;
const logger_1 = __importDefault(require("./logger"));
/**
 * Memory manager class for tracking and optimizing memory usage
 */
class MemoryManager {
    /**
     * Create a new memory manager
     * @param memoryThresholdMB Threshold in MB for memory warnings
     */
    constructor(memoryThresholdMB = 1000) {
        this.memoryWarningInterval = null;
        this.memoryHistory = [];
        this.MAX_HISTORY_SIZE = 100;
        this.memoryThreshold = memoryThresholdMB * 1024 * 1024; // Convert to bytes
        // Log initial memory state
        this.logMemoryUsage();
    }
    /**
     * Start memory monitoring
     * @param intervalMs Monitoring interval in milliseconds
     */
    startMonitoring(intervalMs = 60000) {
        // Clear any existing interval
        this.stopMonitoring();
        // Set up new monitoring interval
        this.memoryWarningInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, intervalMs);
        logger_1.default.info(`Memory monitoring started with interval: ${intervalMs}ms`);
    }
    /**
     * Stop memory monitoring
     */
    stopMonitoring() {
        if (this.memoryWarningInterval) {
            clearInterval(this.memoryWarningInterval);
            this.memoryWarningInterval = null;
            logger_1.default.info('Memory monitoring stopped');
        }
    }
    /**
     * Check current memory usage and issue warnings if needed
     */
    checkMemoryUsage() {
        const usage = this.getMemoryUsage();
        // Store in history
        this.memoryHistory.push({ timestamp: Date.now(), usage });
        if (this.memoryHistory.length > this.MAX_HISTORY_SIZE) {
            this.memoryHistory.shift(); // Remove oldest entry
        }
        // Check against threshold
        if (usage.heapUsed > this.memoryThreshold) {
            logger_1.default.warn(`High memory usage detected: ${usage.formatted.heapUsed} heap used`, {
                memoryUsage: usage.formatted
            });
            // Suggest forced garbage collection if available
            if (global.gc) {
                logger_1.default.info('Triggering garbage collection');
                this.triggerGarbageCollection();
            }
            else {
                logger_1.default.info('Consider running with --expose-gc flag to enable garbage collection');
            }
        }
    }
    /**
     * Get current memory usage
     * @returns Memory usage information
     */
    getMemoryUsage() {
        // Get memory usage from Node.js
        const memoryUsage = process.memoryUsage();
        // Create formatted version for logging
        const formatted = {
            rss: this.formatBytes(memoryUsage.rss),
            heapTotal: this.formatBytes(memoryUsage.heapTotal),
            heapUsed: this.formatBytes(memoryUsage.heapUsed),
            external: this.formatBytes(memoryUsage.external)
        };
        return {
            rss: memoryUsage.rss,
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external,
            formatted
        };
    }
    /**
     * Log current memory usage
     */
    logMemoryUsage() {
        const usage = this.getMemoryUsage();
        logger_1.default.info('Memory usage', {
            rss: usage.formatted.rss,
            heapTotal: usage.formatted.heapTotal,
            heapUsed: usage.formatted.heapUsed,
            external: usage.formatted.external
        });
    }
    /**
     * Trigger garbage collection if available
     * Note: Node.js must be run with --expose-gc flag
     */
    triggerGarbageCollection() {
        if (global.gc) {
            const beforeUsage = this.getMemoryUsage();
            // Run garbage collection
            global.gc();
            // Log memory change
            const afterUsage = this.getMemoryUsage();
            const savedBytes = beforeUsage.heapUsed - afterUsage.heapUsed;
            logger_1.default.info(`Garbage collection completed: ${this.formatBytes(savedBytes)} freed`, {
                before: beforeUsage.formatted.heapUsed,
                after: afterUsage.formatted.heapUsed
            });
        }
        else {
            logger_1.default.warn('Garbage collection not available. Run with --expose-gc flag to enable.');
        }
    }
    /**
     * Get memory usage history
     * @returns Memory usage history
     */
    getMemoryHistory() {
        return this.memoryHistory;
    }
    /**
     * Clear memory history
     */
    clearMemoryHistory() {
        this.memoryHistory = [];
        logger_1.default.debug('Memory history cleared');
    }
    /**
     * Format bytes to human readable string
     * @param bytes Number of bytes
     * @returns Human readable string
     */
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    }
    /**
     * Format time difference to human readable string
     * @param milliseconds Time difference in milliseconds
     * @returns Human readable string
     */
    formatTimeDiff(milliseconds) {
        if (milliseconds < 1000)
            return `${milliseconds}ms`;
        if (milliseconds < 60000)
            return `${(milliseconds / 1000).toFixed(1)}s`;
        if (milliseconds < 3600000)
            return `${(milliseconds / 60000).toFixed(1)}m`;
        return `${(milliseconds / 3600000).toFixed(1)}h`;
    }
    /**
     * Get memory leak detection report by analyzing memory history
     * @returns Analysis report
     */
    analyzeMemoryTrend() {
        // Need at least 5 data points for trend analysis
        if (this.memoryHistory.length < 5) {
            return {
                increasing: false,
                rate: 'Unknown',
                averageIncrease: 0,
                potentialLeak: false,
                recommendation: 'Collect more data points for trend analysis'
            };
        }
        // Calculate memory growth rate
        const first = this.memoryHistory[0];
        const last = this.memoryHistory[this.memoryHistory.length - 1];
        const timeDiffMs = last.timestamp - first.timestamp;
        const memoryDiffBytes = last.usage.heapUsed - first.usage.heapUsed;
        // Convert to KB per minute for readability
        const rateKBPerMinute = (memoryDiffBytes / 1024) / (timeDiffMs / 60000);
        // Determine if memory is consistently increasing
        let increasingCount = 0;
        for (let i = 1; i < this.memoryHistory.length; i++) {
            if (this.memoryHistory[i].usage.heapUsed > this.memoryHistory[i - 1].usage.heapUsed) {
                increasingCount++;
            }
        }
        const consistentlyIncreasing = increasingCount >= (this.memoryHistory.length * 0.7);
        const potentialLeak = consistentlyIncreasing && rateKBPerMinute > 500; // More than 500KB/min
        // Generate recommendation
        let recommendation = '';
        if (potentialLeak) {
            recommendation = 'Potential memory leak detected. Review object lifecycles, event listeners, and timer cleanup.';
        }
        else if (consistentlyIncreasing) {
            recommendation = 'Memory usage is increasing but at an acceptable rate. Monitor for changes.';
        }
        else {
            recommendation = 'Memory usage appears stable.';
        }
        return {
            increasing: consistentlyIncreasing,
            rate: `${rateKBPerMinute.toFixed(2)} KB/minute`,
            averageIncrease: rateKBPerMinute,
            potentialLeak,
            recommendation
        };
    }
}
exports.MemoryManager = MemoryManager;
// Export singleton instance
exports.memoryManager = new MemoryManager();
// Export function to run memory analysis for diagnostics
function diagnoseMemory() {
    const usage = exports.memoryManager.getMemoryUsage(); // Use getMemoryUsage() to get the data
    logger_1.default.info('=== MEMORY DIAGNOSTIC REPORT ===');
    logger_1.default.info(`Total process memory: ${usage.formatted.rss}`);
    logger_1.default.info(`Heap usage: ${usage.formatted.heapUsed} / ${usage.formatted.heapTotal}`);
    // Try to run garbage collection
    if (global.gc) {
        logger_1.default.info('Running garbage collection...');
        exports.memoryManager.triggerGarbageCollection();
    }
    // Analyze memory trend
    const trend = exports.memoryManager.analyzeMemoryTrend();
    logger_1.default.info('Memory trend analysis:', trend);
}
// Remove conflicting global declaration block
/*
// Add global type definition for gc when running with --expose-gc
declare global {
  var gc: (() => void) | undefined;
}
*/
