/**
 * Memory Manager - Utilities for monitoring and managing memory usage
 *
 * This module helps track memory usage and provides tools to reduce memory pressure
 */
import logger from './logger.js';
/**
 * Memory manager class for tracking and optimizing memory usage
 */
export class MemoryManager {
    memoryThreshold;
    memoryWarningInterval = null;
    memoryHistory = [];
    MAX_HISTORY_SIZE = 100;
    MEMORY_LEAK_THRESHOLD = 10; // 10% threshold
    /**
     * Create a new memory manager
     * @param memoryThresholdMB Threshold in MB for memory warnings
     */
    constructor(memoryThresholdMB = 1000) {
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
        logger.info(`Memory monitoring started with interval: ${intervalMs}ms`);
    }
    /**
     * Stop memory monitoring
     */
    stopMonitoring() {
        if (this.memoryWarningInterval) {
            clearInterval(this.memoryWarningInterval);
            this.memoryWarningInterval = null;
            logger.info('Memory monitoring stopped');
        }
    }
    /**
     * Check current memory usage and issue warnings if needed
     */
    checkMemoryUsage() {
        const usage = process.memoryUsage();
        // Store in history
        this.memoryHistory.push({ timestamp: Date.now(), usage });
        if (this.memoryHistory.length > this.MAX_HISTORY_SIZE) {
            this.memoryHistory.shift(); // Remove oldest entry
        }
        // Check against threshold
        if (usage.heapUsed > this.memoryThreshold) {
            logger.warn(`High memory usage detected: ${this.formatBytes(usage.heapUsed)} heap used`, {
                memoryUsage: this.formatMemoryUsage(usage),
            });
            // Suggest forced garbage collection if available
            if (typeof global.gc === 'function') {
                logger.info('Triggering garbage collection');
                this.triggerGarbageCollection();
            }
            else {
                logger.info('Consider running with --expose-gc flag to enable garbage collection');
            }
        }
        this.findMemoryLeaks();
    }
    /**
     * Get current memory usage
     * @returns Memory usage information
     */
    getMemoryUsage() {
        // Get memory usage directly from Node.js
        const memoryUsage = process.memoryUsage();
        // Return the standard NodeJS.MemoryUsage object, cast to our (now identical) MemoryUsage type
        return memoryUsage;
    }
    /**
     * Log current memory usage
     */
    logMemoryUsage() {
        const usage = this.getMemoryUsage();
        logger.info('Memory usage', {
            rss: this.formatBytes(usage.rss),
            heapTotal: this.formatBytes(usage.heapTotal),
            heapUsed: this.formatBytes(usage.heapUsed),
            external: this.formatBytes(usage.external),
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
            logger.info(`Garbage collection completed: ${this.formatBytes(savedBytes)} freed`, {
                before: this.formatBytes(beforeUsage.heapUsed),
                after: this.formatBytes(afterUsage.heapUsed),
            });
        }
        else {
            logger.warn('Garbage collection not available. Run with --expose-gc flag to enable.');
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
        logger.debug('Memory history cleared');
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
                recommendation: 'Collect more data points for trend analysis',
            };
        }
        // Calculate memory growth rate
        const first = this.memoryHistory[0];
        const last = this.memoryHistory[this.memoryHistory.length - 1];
        // Ensure first and last elements exist before accessing properties
        if (!first || !last) {
            return {
                increasing: false,
                rate: 'Error',
                averageIncrease: 0,
                potentialLeak: false,
                recommendation: 'Error retrieving memory history data',
            };
        }
        const timeDiffMs = last.timestamp - first.timestamp;
        const memoryDiffBytes = last.usage.heapUsed - first.usage.heapUsed;
        // Convert to KB per minute for readability
        const rateKBPerMinute = memoryDiffBytes / 1024 / (timeDiffMs / 60000);
        // Determine if memory is consistently increasing
        let increasingCount = 0;
        for (let i = 1; i < this.memoryHistory.length; i++) {
            // Ensure both current and previous heapUsed values are numbers before comparing
            const currentHeapUsed = this.memoryHistory[i]?.usage?.heapUsed;
            const previousHeapUsed = this.memoryHistory[i - 1]?.usage?.heapUsed;
            if (typeof currentHeapUsed === 'number' &&
                typeof previousHeapUsed === 'number' &&
                currentHeapUsed > previousHeapUsed) {
                increasingCount++;
            }
        }
        const consistentlyIncreasing = increasingCount >= this.memoryHistory.length * 0.7;
        const potentialLeak = consistentlyIncreasing && rateKBPerMinute > 500; // More than 500KB/min
        // Generate recommendation
        let recommendation = '';
        if (potentialLeak) {
            recommendation =
                'Potential memory leak detected. Review object lifecycles, event listeners, and timer cleanup.';
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
            recommendation,
        };
    }
    /**
     * Format memory usage to human readable string
     * @param usage Memory usage information
     * @returns Human readable string
     */
    formatMemoryUsage(usage) {
        return {
            rss: this.formatBytes(usage.rss),
            heapTotal: this.formatBytes(usage.heapTotal),
            heapUsed: this.formatBytes(usage.heapUsed),
            external: this.formatBytes(usage.external),
        };
    }
    calculateMemoryDiff() {
        if (!this.memoryHistory || this.memoryHistory.length < 2) {
            return { memoryDiffBytes: 0, timeDiffMs: 0 };
        }
        const last = this.memoryHistory[this.memoryHistory.length - 1];
        const first = this.memoryHistory[0];
        if (!last || !first) {
            logger.warn('Insufficient memory history for diff calculation.'); // Added log
            return { memoryDiffBytes: 0, timeDiffMs: 0 };
        }
        const timeDiffMs = last.timestamp - first.timestamp;
        const memoryDiffBytes = last.usage.heapUsed - first.usage.heapUsed;
        return { memoryDiffBytes, timeDiffMs };
    }
    findMemoryLeaks() {
        const leaks = [];
        if (!this.memoryHistory || this.memoryHistory.length < 2) {
            return leaks;
        }
        for (let i = 1; i < this.memoryHistory.length; i++) {
            const current = this.memoryHistory[i];
            const previous = this.memoryHistory[i - 1];
            if (!current?.usage || !previous?.usage)
                continue;
            if (current.usage.heapUsed > previous.usage.heapUsed) {
                const leak = {
                    timestamp: current.timestamp,
                    bytesLeaked: current.usage.heapUsed - previous.usage.heapUsed,
                    heapUsed: current.usage.heapUsed,
                    heapTotal: current.usage.heapTotal,
                };
                leaks.push(leak);
            }
        }
        return leaks;
    }
}
// Export singleton instance
export const memoryManager = new MemoryManager();
// Export function to run memory analysis for diagnostics
export function diagnoseMemory() {
    const usage = memoryManager.getMemoryUsage(); // Use getMemoryUsage() to get the data
    logger.info('=== MEMORY DIAGNOSTIC REPORT ===');
    logger.info(`Total process memory: ${memoryManager.formatBytes(usage.rss)}`);
    logger.info(`Heap usage: ${memoryManager.formatBytes(usage.heapUsed)} / ${memoryManager.formatBytes(usage.heapTotal)}`);
    // Try to run garbage collection
    if (typeof global.gc === 'function') {
        logger.info('Running garbage collection...');
        memoryManager.triggerGarbageCollection();
    }
    // Analyze memory trend
    const trend = memoryManager.analyzeMemoryTrend();
    logger.info('Memory trend analysis:', trend);
}
//# sourceMappingURL=memoryManager.js.map