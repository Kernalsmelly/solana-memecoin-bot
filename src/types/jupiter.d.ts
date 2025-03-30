import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

declare module '@jup-ag/core' {
    export interface JupiterOptions {
        connection: Connection;
        cluster: 'mainnet-beta' | 'devnet';
        user?: PublicKey;
        wrapUnwrapSOL?: boolean;
        routeCacheDuration?: number;
        restrictIntermediateTokens?: boolean;
        tokenLedger?: PublicKey;
    }

    export interface Route {
        inAmount: number;
        outAmount: number;
        priceImpactPct: number;
        marketInfos: any[];
        amount: number;
        slippageBps: number;
        otherAmountThreshold: number;
        swapMode: string;
        fees: {
            signatureFee: number;
            openOrdersDeposits: number[];
            ataDeposits: number[];
            totalFeeAndDeposits: number;
            minimumSOLForTransaction: number;
        };
    }

    export interface ExecuteParams {
        computeUnitPriceMicroLamports?: number;
        confirmationStrategy?: {
            signature: boolean;
            processed: boolean;
            confirmed: boolean;
            finalized: boolean;
        };
    }

    export interface Jupiter {
        computeRoutes(params: {
            inputMint: PublicKey;
            outputMint: PublicKey;
            amount: number;
            slippageBps: number;
            feeBps?: number;
            onlyDirectRoutes?: boolean;
            filterTopNResult?: number;
        }): Promise<{
            routesInfos: Route[];
        }>;
        exchange(params: {
            routeInfo: Route;
            userPublicKey?: PublicKey;
        }): Promise<{
            swapTransaction: Transaction | VersionedTransaction;
            addressLookupTableAccounts: any[];
            execute: (params?: ExecuteParams) => Promise<{
                signature: string;
                error?: string;
            }>;
        }>;
    }

    export function load(params: JupiterOptions): Promise<Jupiter>;
}
