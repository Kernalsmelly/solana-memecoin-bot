declare const mockLogger: {
    error: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    info: (message: string, meta?: any) => void;
    debug: (message: string, meta?: any) => void;
    close: () => Promise<void>;
    clear: () => void;
};
export default mockLogger;
export { mockLogger };
//# sourceMappingURL=mockLogger.d.ts.map