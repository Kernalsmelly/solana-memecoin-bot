// Minimal TradingEngine stub
exports.TradingEngine = class {
  constructor() {
    this.parameterFeedbackLoop = { adjustPumpThreshold: () => {} };
  }
  hasRecentNaturalVolume() {
    return true;
  }
  shouldTrade() {
    return true;
  }
  buyToken() {
    return { latency: 0 };
  }
  getCandidateTokens() {
    return [];
  }
  rotateKeys() {}
};
