"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Simple console logger for performance testing
const logger = {
    info: (message, meta) => {
        console.log(`[INFO] ${message}`, meta || '');
    },
    warn: (message, meta) => {
        console.warn(`[WARN] ${message}`, meta || '');
    },
    error: (message, meta) => {
        console.error(`[ERROR] ${message}`, meta || '');
    },
    debug: (message, meta) => {
        if (process.env.DEBUG === 'true') {
            console.debug(`[DEBUG] ${message}`, meta || '');
        }
    }
};
exports.default = logger;
