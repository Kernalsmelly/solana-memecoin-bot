import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Config } from '../utils/config.js';
interface PositionInfo {
    entryPrice: number;
    entryTimestamp: number;
    amountBoughtUi: number | undefined;
    pairAddress: string;
}
export type SendAlertFn = (msg: string, level?: string) => Promise<boolean>;
export declare class TradingEngine {
    private connection;
    private config;
    private wallet;
    private keyRotationManager?;
    private riskManager;
    private strategyCoordinator;
    private volatilitySqueeze;
    private altStrategy;
    private feedbackLoop;
    private feedbackBatchSize;
    private feedbackDeltaPct;
    private maxDrawdownPercent;
    private drawdownAlertPct;
    private txnBuilder;
    private consecutiveLosses;
    private enableAlternativeStrategy;
    currentPositions: Map<string, PositionInfo>;
    get positions(): Map<string, PositionInfo>;
    set positions(val: Map<string, PositionInfo>);
    constructor(connection: Connection, config: Config, wallet: Keypair, keyRotationManager?: import("../utils/keyRotationManager.js").KeyRotationManager | undefined, sendAlertFn?: SendAlertFn);
    getWalletPublicKey(): PublicKey;
    getConsecutiveLosses(): number;
    checkLossAlert(drawdown: number, threshold: number): Promise<void>;
    private calculatePositionSize;
    private handleSignalMode;
    buyToken(outputMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean>;
    private getQuote;
    private executeSwap;
    sellToken(tokenMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean>;
    closePosition(tokenMint: PublicKey, pairAddress?: string, marketData?: any): Promise<boolean>;
    private calculatePositionPnl;
    private isPositionInDrawdown;
    monitorPositions(): Promise<void>;
    private sendAndConfirmTransaction;
}
export {};
//# sourceMappingURL=tradingEngine.d.ts.map