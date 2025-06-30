export interface SignalPayload {
    type: 'BUY_SIGNAL' | 'SELL_SIGNAL' | 'ALERT';
    token: {
        mint: string;
        symbol?: string;
        poolAddress?: string;
    };
    price: number;
    liquidity: number;
    volume: number;
    buyRatio: number;
    reason: string;
    links?: {
        solscan?: string;
        raydium?: string;
    };
    timestamp?: number;
}
export declare function sendDiscordSignal(payload: SignalPayload, webhookUrlOverride?: string): Promise<void>;
//# sourceMappingURL=discordNotifier.d.ts.map