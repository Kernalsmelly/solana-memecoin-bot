import { EventEmitter } from 'events';
import { OHLCVEvent } from '../utils/priceFeedManager';
export interface PatternMatchEvent {
    address: string;
    timestamp: number;
    suggestedSOL: number;
    details?: any;
}
export declare class PatternDetector extends EventEmitter {
    private windows;
    private windowMs;
    private smaWindowMs;
    handleOHLCV(event: OHLCVEvent): void;
    private checkSqueeze;
}
//# sourceMappingURL=patternDetector.d.ts.map