import EventEmitter from 'events';
// In-memory config and metrics (replace with real config/metrics integration)
let liveParams = null;
let parameter_updates_total = 0;
const emitter = new EventEmitter();
export function updateLiveParams(params) {
    liveParams = params;
}
export function emitParameterUpdateEvent(params) {
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
//# sourceMappingURL=selfTuning.js.map