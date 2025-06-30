/**
 * Memory Manager - Utilities for monitoring and managing memory usage
 *
 * This module helps track memory usage and provides tools to reduce memory pressure
 */
/**
 * Memory usage information
 */
export interface MemoryUsage extends NodeJS.MemoryUsage {
}
/**
 * Memory leak information
 */
export interface MemoryLeak {
    timestamp: number;
    bytesLeaked: number;
    heapUsed: number;
    heapTotal: number;
}
/**
 * Memory manager class for tracking and optimizing memory usage
 */
export declare class MemoryManager {
    private memoryThreshold;
    private memoryWarningInterval;
    private memoryHistory;
    private readonly MAX_HISTORY_SIZE;
    private readonly MEMORY_LEAK_THRESHOLD;
    /**
     * Create a new memory manager
     * @param memoryThresholdMB Threshold in MB for memory warnings
     */
    constructor(memoryThresholdMB?: number);
    /**
     * Start memory monitoring
     * @param intervalMs Monitoring interval in milliseconds
     */
    startMonitoring(intervalMs?: number): void;
    /**
     * Stop memory monitoring
     */
    stopMonitoring(): void;
    /**
     * Check current memory usage and issue warnings if needed
     */
    checkMemoryUsage(): void;
    /**
     * Get current memory usage
     * @returns Memory usage information
     */
    getMemoryUsage(): MemoryUsage;
    /**
     * Log current memory usage
     */
    logMemoryUsage(): void;
    /**
     * Trigger garbage collection if available
     * Note: Node.js must be run with --expose-gc flag
     */
    triggerGarbageCollection(): void;
    /**
     * Get memory usage history
     * @returns Memory usage history
     */
    getMemoryHistory(): Array<{
        timestamp: number;
        usage: MemoryUsage;
    }>;
    /**
     * Clear memory history
     */
    clearMemoryHistory(): void;
    /**
     * Format bytes to human readable string
     * @param bytes Number of bytes
     * @returns Human readable string
     */
    formatBytes(bytes: number): string;
    /**
     * Format time difference to human readable string
     * @param milliseconds Time difference in milliseconds
     * @returns Human readable string
     */
    private formatTimeDiff;
    /**
     * Get memory leak detection report by analyzing memory history
     * @returns Analysis report
     */
    analyzeMemoryTrend(): {
        increasing: boolean;
        rate: string;
        averageIncrease: number;
        potentialLeak: boolean;
        recommendation: string;
    };
    /**
     * Format memory usage to human readable string
     * @param usage Memory usage information
     * @returns Human readable string
     */
    private formatMemoryUsage;
    private calculateMemoryDiff;
    private findMemoryLeaks;
}
export declare const memoryManager: MemoryManager;
export declare function diagnoseMemory(): void;
//# sourceMappingURL=memoryManager.d.ts.map