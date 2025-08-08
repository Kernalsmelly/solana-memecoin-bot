import { EventEmitter } from 'events';
import { Strategy } from './strategyCoordinator.js';
export declare class MomentumBreakoutStrategy extends EventEmitter implements Strategy {
    name: string;
    enabled: boolean;
    cooldownSec: number;
    private priceHistory;
    private maxHistory;
    private momentumThreshold;
    private rollingWindowMs;
    constructor(options?: {
        cooldownSec?: number;
        maxHistory?: number;
        momentumThreshold?: number;
    });
    handleOHLCV(event: any): Promise<void>;
    execute(token: string): Promise<void>;
}
export default MomentumBreakoutStrategy;
//# sourceMappingURL=momentumBreakout.d.ts.map