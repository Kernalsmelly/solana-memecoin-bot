// Universal mockLogger for all test imports
const mockLogger = {
  error: (message: string, meta?: any): void => {},
  warn: (message: string, meta?: any): void => {},
  info: (message: string, meta?: any): void => {},
  debug: (message: string, meta?: any): void => {},
  close: (): Promise<void> => Promise.resolve(),
  clear: (): void => {},
};
(mockLogger as any).default = mockLogger;
(mockLogger as any).default.default = mockLogger;
(mockLogger as any).debug = mockLogger.debug;
(mockLogger as any).default.debug = mockLogger.debug;
export default mockLogger;
export { mockLogger };
