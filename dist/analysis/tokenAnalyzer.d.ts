export interface BirdeyeTokenData {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    liquidity?: number;
    volume?: number;
    price?: number;
    priceChange?: number;
    mcap?: number;
    createdAt?: number;
    isScam?: boolean;
    hasLiquidity?: boolean;
    holders?: number;
}
export interface AnalyzedToken extends BirdeyeTokenData {
    score: number;
    analysisTime: number;
    isVerified?: boolean;
    riskLevel?: 'low' | 'medium' | 'high';
    analysisDetails?: {
        liquidityScore?: number;
        nameScore?: number;
        holderScore?: number;
        ageScore?: number;
    };
}
export declare class TokenAnalyzer {
    private scamPatterns;
    private nameBlacklist;
    private addressBlacklist;
    private minLiquidity;
    private minHolders;
    private tokenScoreCache;
    private cacheManager;
    constructor({ minLiquidity, // Minimum liquidity in USD
    minHolders, // Minimum holder count
    cacheTimeMs }?: {
        minLiquidity?: number | undefined;
        minHolders?: number | undefined;
        cacheTimeMs?: number | undefined;
    });
    analyzeToken(token: BirdeyeTokenData): AnalyzedToken;
    private isLikelyScam;
    private calculateLiquidityScore;
    private calculateNameScore;
    private calculateHolderScore;
    private calculateAgeScore;
    addAddressToBlacklist(address: string): void;
    private getCachedScore;
    private cacheScore;
    clearScoreCache(): void;
}
//# sourceMappingURL=tokenAnalyzer.d.ts.map