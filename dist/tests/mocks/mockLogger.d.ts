/**
 * Mock logger for tests to prevent file system operations
 * Optimized for memory efficiency by avoiding capturing logs
 */
declare const mockLogger: {
    error: (message: string, meta?: object) => void;
    warn: (message: string, meta?: object) => void;
    info: (message: string, meta?: object) => void;
    debug: (message: string, meta?: object) => void;
    close: () => Promise<void>;
    clear: () => void;
};
export default mockLogger;
//# sourceMappingURL=mockLogger.d.ts.map