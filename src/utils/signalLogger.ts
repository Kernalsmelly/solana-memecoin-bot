import fs from 'fs';
import path from 'path';

const LOG_PATH = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../signals.log');

export function logSignal(signal: any) {
  const entry = {
    ...signal,
    loggedAt: new Date().toISOString(),
  };
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}
