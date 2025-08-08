export class TradingEngine {
  parameterFeedbackLoop: { adjustPumpThreshold: (...args: any[]) => void };
  constructor(...args: any[]);
  hasRecentNaturalVolume(): boolean;
  shouldTrade(): boolean;
  buyToken(): { latency: number };
  getCandidateTokens(): any[];
  rotateKeys(): void;
}
