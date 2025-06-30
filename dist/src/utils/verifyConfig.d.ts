interface ConfigValidationResult {
    isValid: boolean;
    missingRequired: string[];
    missingRecommended: string[];
    walletStatus: {
        valid: boolean;
        address?: string;
        balance?: number;
        error?: string;
    };
    rpcStatus: {
        valid: boolean;
        latency?: number;
        error?: string;
    };
    riskParameters: {
        valid: boolean;
        issues: string[];
    };
}
declare function verifyConfig(): Promise<ConfigValidationResult>;
export default verifyConfig;
//# sourceMappingURL=verifyConfig.d.ts.map