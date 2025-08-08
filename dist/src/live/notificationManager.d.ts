import { PatternDetection, RiskMetrics } from '../types.js';
interface DiscordConfig {
    webhookUrl: string;
}
interface TelegramConfig {
    apiId: number;
    apiHash: string;
    sessionString: string;
    chatId: string;
}
interface NotificationConfig {
    discord?: DiscordConfig;
    telegram?: TelegramConfig;
    notifyLevel?: 'all' | 'trades' | 'errors' | 'patterns' | 'none';
}
export declare class NotificationManager {
    private discord?;
    private telegram?;
    private notifyLevel;
    constructor(config: NotificationConfig);
    notifyPattern(pattern: PatternDetection): Promise<void>;
    notifyTrade(trade: any): Promise<void>;
    notifyRisk(metrics: RiskMetrics): Promise<void>;
    notifyError(error: string | Error): Promise<void>;
    notifyInfo(message: string): Promise<void>;
    notify(message: string, level: 'all' | 'trades' | 'errors' | 'patterns'): Promise<void>;
    private sendDiscordMessage;
    private sendTelegramMessage;
    cleanup(): Promise<void>;
}
export {};
//# sourceMappingURL=notificationManager.d.ts.map