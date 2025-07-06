"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitParameterUpdateEvent = emitParameterUpdateEvent;
// src/utils/emitParameterUpdateEvent.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function emitParameterUpdateEvent(params) {
    const logPath = path_1.default.join(__dirname, '../../data/parameter_update_events.log');
    const event = {
        event: 'ParameterUpdateEvent',
        timestamp: new Date().toISOString(),
        stopLossPercent: params.stopLossPercent,
        takeProfitPercent: params.takeProfitPercent,
    };
    fs_1.default.appendFileSync(logPath, JSON.stringify(event) + '\n');
    console.log('[ParameterUpdateEvent]', event);
}
// Example usage:
// emitParameterUpdateEvent({ stopLossPercent: 1, takeProfitPercent: 1 });
//# sourceMappingURL=emitParameterUpdateEvent.js.map