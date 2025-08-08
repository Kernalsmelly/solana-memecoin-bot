interface BacktestConfig {
    minutes: number;
    maxTrades: number;
    simulationMode: boolean;
}
export declare function runSecretSauceBacktest(config: BacktestConfig): Promise<void>;
export {};
//# sourceMappingURL=backtest_secret_sauce.d.ts.map