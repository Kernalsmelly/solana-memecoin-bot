export interface SwapResult {
    success: boolean;
    txSignature?: string;
    error?: string;
}
export declare class RaydiumDEX {
    private readonly rpcEndpoint;
    private readonly slippageTolerance;
    constructor();
    executeSwap(walletPrivateKey: string, inputMint: string, outputMint: string, amountIn: number, customSlippage?: number): Promise<SwapResult>;
    getQuote(inputMint: string, outputMint: string, amountIn: number): Promise<{
        price: number;
        impact: number;
    } | null>;
}
export declare const raydiumDex: RaydiumDEX;
//# sourceMappingURL=raydiumDex.d.ts.map