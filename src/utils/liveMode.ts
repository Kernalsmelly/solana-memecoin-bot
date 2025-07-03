import dotenv from 'dotenv';
dotenv.config();

let _liveMode: boolean | undefined;

// Test-only helper to reset cache
export function __resetLiveModeCache() {
  _liveMode = undefined;
}

export function isLiveMode(): boolean {
  if (_liveMode === undefined) {
    const env = process.env.LIVE_MODE;
    _liveMode = env === 'true' || env === '1';
  }
  return _liveMode;
}
