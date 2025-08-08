export declare const RiskLevel: {
    readonly LOW: "LOW";
    readonly MEDIUM: "MEDIUM";
    readonly HIGH: "HIGH";
    readonly CRITICAL: "CRITICAL";
};
type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];
import { Cluster } from '@solana/web3.js';
export interface Config {
    /**
     * If true, the bot will simulate trades (no live orders sent).
     */
    trading: {
        /**
         * Threshold for pump detection (custom script usage)
         */
        pumpThreshold?: number;
        /**
         * Pump window in seconds (custom script usage)
         */
        pumpWindowSec?: number;
        /**
         * Max hold time in seconds (custom script usage)
         */
        maxHoldSec?: number;
        /**
         * If true, the bot will simulate trades (no live orders sent).
         */
        dryRun?: boolean;
        /**
         * If true, force a buy on mempool event (regardless of pattern filter)
         */
        forcePumpOnMempool?: boolean;
        /**
         * If true, force a buy on whale event (regardless of pattern filter)
         */
        forcePumpOnWhale?: boolean;
        /**
         * Size in SOL for forced pump buys
         */
        forcedPumpSizeSol?: number;
        /**
         * Seconds to wait before executing forced pump
         */
        forcedPumpWaitSec?: number;
        initialBalance: number;
        maxPositionSize: number;
        maxRiskLevel: RiskLevel;
        newTokenAgeHours?: number;
        newVolumeSpikePercent?: number;
        newBuyRatio?: number;
        newMinLiquidity?: number;
        establishedTokenAgeHours?: number;
        establishedVolumeSpikePercent?: number;
        establishedBuyRatio?: number;
        establishedMinLiquidity?: number;
        priceChangePercentNew?: number;
        priceChangePercentEstablished?: number;
        priceChangeThreshold?: number;
        volumeMultiplier?: number;
        riskPct?: number;
        maxPositions?: number;
        maxPositionValueUsd?: number;
        maxCashAllocationPercent?: number;
        ageBasedRiskAdjustment?: boolean;
        autoSave: boolean;
        dataDirectory: string;
        slippageTolerance: number;
        simulationMode: boolean;
        autoTrade: boolean;
        jupiterSlippageBps: number;
        targetPositionValueUsd: number;
        minPositionValueUsd: number;
        minLiquidity: number;
        maxLiquidityPercentage: number;
        slippageBps: number | undefined;
        maxConcurrentPositions: number | undefined;
        maxPositionSizeUsd: number | undefined;
        txConfirmationTimeoutMs?: number;
        txPriorityFeeMicroLamports?: number;
    };
    solana: {
        rpcEndpoint: string;
        wssEndpoint: string;
        walletPrivateKey: string;
        usdcMint: string;
        cluster: Cluster;
    };
    notifications: {
        enabled: boolean;
        discordWebhookUrl?: string;
        telegramBotToken?: string;
        telegramChatId?: string;
        telegramApiId?: number;
        telegramApiHash?: string;
        telegramSessionString?: string;
        logLevel: 'info' | 'warn' | 'error' | 'debug';
        notifyLevel?: 'all' | 'trades' | 'errors' | 'patterns' | 'none';
        notifyOnTrade: boolean;
        notifyOnError: boolean;
        notifyOnStart: boolean;
        notifyOnStatusUpdate: boolean;
    };
    risk: {
        maxActivePositions: number;
        maxDailyLossPercent: number;
        maxDrawdownPercent: number;
        volatilityThreshold: number;
        priceDeviationThreshold: number;
        defaultStopLossPercent: number;
        trailingStopEnabled?: boolean;
        trailingStopActivationPercent?: number;
        trailingStopTrailPercent?: number;
        maxPortfolioAllocationPercent?: number;
        maxTradesPerMinute: number;
        maxTradesPerHour: number;
        maxTradesPerDay: number;
        minSuccessRate: number;
    };
    tokenMonitor: {
        minLiquidityUsd: number;
        maxTokenAgeHours: number;
        scanIntervalSeconds: number;
        defaultTimeframe: string;
        wsEndpoint: string;
        reconnectInterval: number;
        maxRetries: number;
        pollingIntervalSeconds: number;
        maxSignaturesToStore: number;
    };
    debug: {
        verbose: boolean;
        logLevel: string;
    };
    sellCriteria: {
        minSellLiquidity: number | undefined;
        minSellBuyRatio: number | undefined;
        stopLossPercent: number | undefined;
        takeProfitPercent: number | undefined;
    };
}
/**
 * Bot analytics & notification settings
 */
export interface AnalyticsConfig {
    /**
     * How often to send summary notifications (minutes)
     */
    summaryIntervalMinutes: number;
    /**
     * How far back to look for realized PnL analytics (minutes)
     */
    analyticsWindowMinutes: number;
}
export declare const config: Config;
export declare const analyticsConfig: AnalyticsConfig;
export declare function validateConfig(config: Config): void;
export {};
//# sourceMappingURL=config.d.ts.map