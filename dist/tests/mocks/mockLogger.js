"use strict";
/**
 * Mock logger for tests to prevent file system operations
 * Optimized for memory efficiency by avoiding capturing logs
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Create a simple console-only mock logger with memory cleanup
const mockLogger = {
    error: (message, meta) => console.error(`[ERROR] ${message}`, meta || ''),
    warn: (message, meta) => console.warn(`[WARN] ${message}`, meta || ''),
    info: (message, meta) => console.info(`[INFO] ${message}`, meta || ''),
    debug: (message, meta) => { },
    close: () => Promise.resolve(),
    // Add a clear method to help with memory management in tests
    clear: () => { }
};
exports.default = mockLogger;
