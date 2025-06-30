"use strict";
// Simple console logger for performance testing
Object.defineProperty(exports, "__esModule", { value: true });
// Helper to safely stringify metadata, handling circular references and errors
const safeStringify = (obj) => {
    if (!obj)
        return '';
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
    }
    catch (e) {
        return `[Unstringifiable Object: ${e instanceof Error ? e.message : String(e)}]`;
    }
};
const logger = {
    info: (message, meta) => {
        console.log(`[INFO] ${message}${meta ? ' ' + safeStringify(meta) : ''}`);
    },
    warn: (message, meta) => {
        console.warn(`[WARN] ${message}${meta ? ' ' + safeStringify(meta) : ''}`);
    },
    error: (message, meta) => {
        // For errors, print the message and stringified meta, but also log the raw error object 
        // separately in case stringification loses details (like stack trace).
        console.error(`[ERROR] ${message}${meta ? ' ' + safeStringify(meta) : ''}`);
        if (meta instanceof Error) {
            console.error('Raw Error:', meta);
        }
        else if (meta && meta.error instanceof Error) {
            // Sometimes the error is nested within the meta object
            console.error('Raw Nested Error:', meta.error);
        }
    },
    debug: (message, meta) => {
        if (process.env.DEBUG === 'true') {
            console.debug(`[DEBUG] ${message}${meta ? ' ' + safeStringify(meta) : ''}`);
        }
    }
};
exports.default = logger;
//# sourceMappingURL=logger.js.map