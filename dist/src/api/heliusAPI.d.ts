export interface HeliusTokenMetadata {
    address: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    logoURI?: string;
    tags?: string[];
    extensions?: Record<string, any>;
    [key: string]: any;
}
export declare function fetchHeliusTokenMetadata(address: string, heliusApiKey: string): Promise<HeliusTokenMetadata | null>;
//# sourceMappingURL=heliusAPI.d.ts.map