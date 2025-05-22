export interface CacheOptions {
    maxSize?: number;
    ttl?: number;
    onEvict?: (key: string, value: any) => void;
}
export declare class LRUCache<T> {
    private cache;
    private maxSize;
    private ttl;
    private onEvict?;
    constructor(options?: CacheOptions);
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    delete(key: string): boolean;
    has(key: string): boolean;
    clear(): void;
    get size(): number;
    cleanup(): number;
    keys(): string[];
}
export declare class CacheManager {
    private caches;
    private cleanupInterval;
    constructor(cleanupIntervalMs?: number);
    getCache<T>(name: string, options?: CacheOptions): LRUCache<T>;
    removeCache(name: string): boolean;
    cleanupAll(): void;
    destroy(): void;
}
export declare const globalCacheManager: CacheManager;
//# sourceMappingURL=cache.d.ts.map