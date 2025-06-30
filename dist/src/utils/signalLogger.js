"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSignal = logSignal;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOG_PATH = path_1.default.resolve(__dirname, '../../signals.log');
function logSignal(signal) {
    const entry = {
        ...signal,
        loggedAt: new Date().toISOString(),
    };
    fs_1.default.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}
//# sourceMappingURL=signalLogger.js.map