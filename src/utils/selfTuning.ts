import { SweepParams } from '../strategy/ParameterSweepManager.js';
import EventEmitter from 'events';

// In-memory config and metrics (replace with real config/metrics integration)
let liveParams: SweepParams | null = null;
let parameter_updates_total = 0;
const emitter = new EventEmitter();

export function updateLiveParams(params: SweepParams) {
  liveParams = params;
}

export function emitParameterUpdateEvent(params: SweepParams) {
  emitter.emit('ParameterUpdateEvent', params);
}

export function incrementParameterUpdateMetric() {
  parameter_updates_total++;
}

export function getParameterMetrics() {
  return {
    parameter_updates_total,
    ...liveParams,
  };
}

export { emitter as parameterEventEmitter };
