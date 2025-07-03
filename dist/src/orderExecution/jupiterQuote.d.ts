export interface JupiterQuote {
    inAmount: number;
    outAmount: number;
    price: number;
    route: any;
    tx: any;
}
export declare function fetchJupiterQuote({ inputMint, outputMint, amount, slippageBps }: {
    inputMint: string;
    outputMint: string;
    amount: number;
    slippageBps: number;
}): Promise<JupiterQuote | null>;
//# sourceMappingURL=jupiterQuote.d.ts.map