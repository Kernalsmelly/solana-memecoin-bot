export class TradingEngine {
    parameterFeedbackLoop: {
        adjustPumpThreshold: () => void;
    };
    hasRecentNaturalVolume(): boolean;
    shouldTrade(): boolean;
    buyToken(): {
        latency: number;
    };
    getCandidateTokens(): never[];
    rotateKeys(): void;
}
//# sourceMappingURL=tradingEngine.d.ts.map