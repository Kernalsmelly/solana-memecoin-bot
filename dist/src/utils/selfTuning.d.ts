import { SweepParams } from '../strategy/ParameterSweepManager.js';
import EventEmitter from 'events';
declare const emitter: EventEmitter<[never]>;
export declare function updateLiveParams(params: SweepParams): void;
export declare function emitParameterUpdateEvent(params: SweepParams): void;
export declare function incrementParameterUpdateMetric(): void;
export declare function getParameterMetrics(): {
    priceChangeThreshold?: number | undefined;
    volumeMultiplier?: number | undefined;
    parameter_updates_total: number;
};
export { emitter as parameterEventEmitter };
//# sourceMappingURL=selfTuning.d.ts.map