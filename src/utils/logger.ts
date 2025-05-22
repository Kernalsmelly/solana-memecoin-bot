// Simple console logger for performance testing

// Helper to safely stringify metadata, handling circular references and errors
const safeStringify = (obj: any): string => {
  if (!obj) return '';
  try {
    // Basic circular reference handler
    const cache = new Set();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          // Circular reference found, discard key
          return '[Circular]';
        }
        // Store value in our collection
        cache.add(value);
      }
      // Handle BigInt serialization
      if (typeof value === 'bigint') {
          return value.toString() + 'n'; // Append 'n' to indicate BigInt
      }
      return value;
    }, 2); // Use indentation for readability
  } catch (e) {
    return `[Unstringifiable Object: ${e instanceof Error ? e.message : String(e)}]`;
  }
};

const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${message}${meta ? ' ' + safeStringify(meta) : ''}`);
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] ${message}${meta ? ' ' + safeStringify(meta) : ''}`);
  },
  error: (message: string, meta?: any) => {
    // For errors, print the message and stringified meta, but also log the raw error object 
    // separately in case stringification loses details (like stack trace).
    console.error(`[ERROR] ${message}${meta ? ' ' + safeStringify(meta) : ''}`);
    if (meta instanceof Error) {
        console.error('Raw Error:', meta);
    } else if (meta && meta.error instanceof Error) {
        // Sometimes the error is nested within the meta object
        console.error('Raw Nested Error:', meta.error);
    }
  },
  debug: (message: string, meta?: any) => {
    if (process.env.DEBUG === 'true') {
      console.debug(`[DEBUG] ${message}${meta ? ' ' + safeStringify(meta) : ''}`);
    }
  }
};

export default logger;
