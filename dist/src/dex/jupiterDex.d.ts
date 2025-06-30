import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import { QuoteResponse } from '@jup-ag/api';
import { RiskManager } from '../live/riskManager';
export interface JupiterQuote {
    originalQuote: QuoteResponse;
    price: string;
    priceImpactPct: number;
    inAmount: string;
    outAmount: string;
    inputMint: string;
    outputMint: string;
    route: QuoteResponse;
}
export interface JupiterSwapResult {
    success: boolean;
    signature?: string;
    error?: string;
    outAmount?: number;
    price?: number;
    errorType?: string;
}
export interface RiskParams {
    maxSlippageBps: number;
    maxPriceImpactPct: number;
    minLiquidityUsd: number;
    maxPositionSizeUsd: number;
    maxPortfolioExposure: number;
}
export declare enum JupiterErrorType {
    INITIALIZATION_ERROR = "INITIALIZATION_ERROR",
    INSUFFICIENT_LIQUIDITY = "INSUFFICIENT_LIQUIDITY",
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    HIGH_PRICE_IMPACT = "HIGH_PRICE_IMPACT",
    NO_ROUTE_FOUND = "NO_ROUTE_FOUND",
    TRANSACTION_ERROR = "TRANSACTION_ERROR",
    CIRCUIT_BREAKER_ACTIVE = "CIRCUIT_BREAKER_ACTIVE",
    EMERGENCY_STOP_ACTIVE = "EMERGENCY_STOP_ACTIVE",
    SYSTEM_DISABLED = "SYSTEM_DISABLED",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    UNKNOWN_ERROR = "UNKNOWN_ERROR",
    INVALID_MINT_ADDRESS = "INVALID_MINT_ADDRESS",
    EXCEEDS_MAX_POSITION_SIZE = "EXCEEDS_MAX_POSITION_SIZE",
    WALLET_SIGN_REJECTED = "WALLET_SIGN_REJECTED",
    SWAP_EXECUTION_FAILED = "SWAP_EXECUTION_FAILED",
    TRANSACTION_CONFIRMATION_FAILURE = "TRANSACTION_CONFIRMATION_FAILURE",
    API_CLIENT_NOT_INITIALIZED = "API_CLIENT_NOT_INITIALIZED",
    CONNECTION_NOT_INITIALIZED = "CONNECTION_NOT_INITIALIZED",
    NO_TRANSACTION_RETURNED = "NO_TRANSACTION_RETURNED"
}
export declare class JupiterError extends Error {
    type: JupiterErrorType;
    details?: any | undefined;
    constructor(type: JupiterErrorType, message: string, details?: any | undefined);
}
interface SignerWallet {
    publicKey: PublicKey;
    signTransaction(transaction: VersionedTransaction): Promise<VersionedTransaction>;
}
export declare class JupiterDex {
    private connection;
    private wallet;
    private riskParams;
    private retryAttempts;
    private retryDelayMs;
    private riskManager;
    private lastApiCallTimestamp;
    private rateLimitWindowMs;
    private jupiterApi;
    private tokenDecimalsCache;
    constructor(connection: Connection, wallet: Keypair, riskParams?: Partial<RiskParams>, riskManager?: RiskManager);
    private getTokenSymbol;
    private checkRateLimit;
    private getTokenDecimals;
    private validatePositionSize;
    getQuote(inputMint: string, outputMint: string, rawAmount: number, // Keep raw amount for internal logic
    slippageBps?: number): Promise<JupiterQuote | null>;
    private executeWithRetry;
    executeSwap(quote: JupiterQuote, // Use the result from our getQuote
    wallet: SignerWallet): Promise<JupiterSwapResult>;
    getTokenBalance(tokenMint: string): Promise<number>;
    setRiskManager(riskManager: RiskManager): void;
}
export {};
//# sourceMappingURL=jupiterDex.d.ts.map