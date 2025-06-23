declare global {
    var fetchTokenMetrics: ((baseMint: string, poolAddress: string) => Promise<any>) | undefined;
    var patternDetector: {
        detect: (metrics: any) => any;
    } | undefined;
}
export {};
//# sourceMappingURL=index.d.ts.map