// Universal mockLogger for all test imports
const mockLogger = {
    error: (message, meta) => { },
    warn: (message, meta) => { },
    info: (message, meta) => { },
    debug: (message, meta) => { },
    close: () => Promise.resolve(),
    clear: () => { },
};
mockLogger.default = mockLogger;
mockLogger.default.default = mockLogger;
mockLogger.debug = mockLogger.debug;
mockLogger.default.debug = mockLogger.debug;
export default mockLogger;
export { mockLogger };
//# sourceMappingURL=mockLogger.js.map