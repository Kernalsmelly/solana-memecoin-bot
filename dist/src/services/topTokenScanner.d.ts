import { PatternDetector } from '../strategy/patternDetector.js';
export declare class TopTokenScanner {
    private patternDetector;
    private running;
    private timer;
    constructor(patternDetector: PatternDetector);
    start(): void;
    stop(): void;
    private scanLoop;
}
//# sourceMappingURL=topTokenScanner.d.ts.map