import { EventEmitter } from 'events';
export interface MockToken {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    liquidity: number;
    createdAt: number;
}
export declare class MockTokenDiscovery extends EventEmitter {
    interval: NodeJS.Timeout | null;
    running: boolean;
    tokens: MockToken[];
    start(intervalMs?: number): void;
    stop(): void;
    emitToken(): void;
}
export declare const mockTokenDiscovery: MockTokenDiscovery;
//# sourceMappingURL=mockTokenDiscovery.d.ts.map