// src/utils/emitParameterUpdateEvent.ts
import fs from 'fs';
import path from 'path';

export function emitParameterUpdateEvent(params: { stopLossPercent: number; takeProfitPercent: number }) {
  const logPath = path.join(__dirname, '../../data/parameter_update_events.log');
  const event = {
    event: 'ParameterUpdateEvent',
    timestamp: new Date().toISOString(),
    stopLossPercent: params.stopLossPercent,
    takeProfitPercent: params.takeProfitPercent,
  };
  fs.appendFileSync(logPath, JSON.stringify(event) + '\n');
  console.log('[ParameterUpdateEvent]', event);
}

// Example usage:
// emitParameterUpdateEvent({ stopLossPercent: 1, takeProfitPercent: 1 });
