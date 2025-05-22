import fs from 'fs';
import path from 'path';

const LOG_PATH = path.resolve(__dirname, '../../signals.log');

export function logSignal(signal: any) {
  const entry = {
    ...signal,
    loggedAt: new Date().toISOString(),
  };
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}
