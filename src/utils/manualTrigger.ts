// Manual trade trigger utility for MVP validation
// Usage: checkForManualTrigger() resolves true if force_trade.txt exists in project root
import fs from 'fs/promises';
import path from 'path';

const TRIGGER_FILE = path.resolve(process.cwd(), 'force_trade.txt');

/**
 * Checks for the existence of the manual trade trigger file.
 * If found, deletes the file and returns true (to avoid duplicate triggers).
 * Returns false otherwise.
 */
export async function checkForManualTrigger(): Promise<boolean> {
  try {
    await fs.access(TRIGGER_FILE);
    await fs.unlink(TRIGGER_FILE); // Remove after detection
    console.log(`[ManualTrigger] Detected and cleared force_trade.txt at ${new Date().toISOString()}`);
    return true;
  } catch {
    return false;
  }
}
