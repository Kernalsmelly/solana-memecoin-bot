// @ts-nocheck
// Minimal logger stub
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
};
module.exports = logger;
module.exports.default = logger;
