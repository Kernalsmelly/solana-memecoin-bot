import { Connection } from '@solana/web3.js';
import { TradingEngine } from './tradingEngine.js';
interface ForcedPumpOptions {
    waitSec: number;
    sizeSol: number;
    dryRun: boolean;
}
export declare class ForcedPumpInjector {
    private connection;
    private options;
    private tradingEngine;
    private lastCheck;
    constructor(connection: Connection, tradingEngine: TradingEngine, options: ForcedPumpOptions);
    inject(tokenMint: string): Promise<boolean>;
    private hasRecentTrades;
}
export {};
//# sourceMappingURL=forcedPump.d.ts.map