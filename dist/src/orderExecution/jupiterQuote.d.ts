export interface JupiterQuote {
    inAmount: number;
    outAmount: number;
    price: number;
    route: any;
    tx: any;
}
export declare function parseJupiterQuote(response: any): {
    parsed: JupiterQuote | null;
    raw: any;
};
export declare function fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps, }: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
}): Promise<{
    parsed: JupiterQuote | null;
    raw: any;
}>;
/**
 * Helper for repeated polling with interval/backoff on rate limit
 */
export declare function getJupiterQuoteWithBackoff(params: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
    minIntervalMs?: number;
    maxBackoffMs?: number;
    maxAttempts?: number;
    bypassCooldown?: boolean;
}): Promise<{
    parsed: JupiterQuote | null;
    raw: any;
}>;
//# sourceMappingURL=jupiterQuote.d.ts.map