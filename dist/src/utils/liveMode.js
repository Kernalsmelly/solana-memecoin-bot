"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__resetLiveModeCache = __resetLiveModeCache;
exports.isLiveMode = isLiveMode;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
let _liveMode;
// Test-only helper to reset cache
function __resetLiveModeCache() {
    _liveMode = undefined;
}
function isLiveMode() {
    if (_liveMode === undefined) {
        const env = process.env.LIVE_MODE;
        _liveMode = env === 'true' || env === '1';
    }
    return _liveMode;
}
//# sourceMappingURL=liveMode.js.map