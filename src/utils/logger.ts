// Simple console logger for performance testing
const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${message}`, meta || '');
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] ${message}`, meta || '');
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${message}`, meta || '');
  },
  debug: (message: string, meta?: any) => {
    if (process.env.DEBUG === 'true') {
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  }
};

export default logger;
