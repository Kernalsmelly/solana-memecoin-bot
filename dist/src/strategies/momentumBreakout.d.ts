import { EventEmitter } from 'events';
import { Strategy } from './strategyCoordinator';
export declare class MomentumBreakoutStrategy extends EventEmitter implements Strategy {
    name: string;
    enabled: boolean;
    cooldownSec: number;
    private priceHistory;
    private maxHistory;
    constructor(options?: {
        cooldownSec?: number;
        maxHistory?: number;
    });
    handleOHLCV(event: any): Promise<void>;
    execute(token: string): Promise<void>;
}
export default MomentumBreakoutStrategy;
//# sourceMappingURL=momentumBreakout.d.ts.map