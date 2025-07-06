import { EventEmitter } from 'events';
interface CoinDetectorConfig {
    minLiquidity: number;
    maxAgeHours: number;
    scanIntervalSec: number;
    birdeyeApiKey?: string;
}
export declare class NewCoinDetector extends EventEmitter {
    private config;
    private detectionHistory;
    private patternHistory;
    private lastScanTime;
    private intervalId?;
    constructor(config?: Partial<CoinDetectorConfig>);
    startMonitoring(): Promise<void>;
    stopMonitoring(): Promise<void>;
    private randomPubkey;
    private generateMockData;
}
export {};
//# sourceMappingURL=newCoinDetector.d.ts.map