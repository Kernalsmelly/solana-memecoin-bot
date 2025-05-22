import { RiskLevel } from '../contractValidator';
import { Cluster } from '@solana/web3.js';
export interface Config {
    trading: {
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
    apis: {
        quicknodeRpcUrl?: string;
        quicknodeWssUrl?: string;
        coingeckoApiKey?: string;
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
export declare const config: Config;
export declare function validateConfig(config: Config): void;
//# sourceMappingURL=config.d.ts.map