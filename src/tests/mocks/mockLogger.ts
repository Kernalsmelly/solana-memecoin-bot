/**
 * Mock logger for tests to prevent file system operations
 * Optimized for memory efficiency by avoiding capturing logs
 */

// Create a simple console-only mock logger with memory cleanup
const mockLogger = {
  error: (message: string, meta?: object) => console.error(`[ERROR] ${message}`, meta || ''),
  warn: (message: string, meta?: object) => console.warn(`[WARN] ${message}`, meta || ''),
  info: (message: string, meta?: object) => console.info(`[INFO] ${message}`, meta || ''),
  debug: (message: string, meta?: object) => { /* Suppress debug in tests to reduce console output */ },
  close: () => Promise.resolve(),
  // Add a clear method to help with memory management in tests
  clear: () => { /* Reset any internal state if needed */ }
};

export default mockLogger;
