import logger from './logger.js';

// LRU Cache implementation with automatic expiration
export interface CacheOptions {
  maxSize?: number; // Maximum number of items to store
  ttl?: number; // Time to live in milliseconds
  onEvict?: (key: string, value: any) => void; // Callback when an item is evicted
}

export class LRUCache<T> {
  private cache: Map<string, { value: T; timestamp: number }>;
  private maxSize: number;
  private ttl: number;
  private onEvict?: (key: string, value: T) => void;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();

    // Validate and set maxSize
    this.maxSize = options.maxSize !== undefined && options.maxSize > 0 ? options.maxSize : 1000; // Default: 1000

    // Validate and set ttl
    this.ttl = options.ttl !== undefined && options.ttl > 0 ? options.ttl : 10 * 60 * 1000; // Default: 10 minutes

    this.onEvict = options.onEvict;

    if (options.maxSize !== undefined && options.maxSize <= 0) {
      logger.warn(`LRUCache: Invalid maxSize (${options.maxSize}). Using default: ${this.maxSize}`);
    }
    if (options.ttl !== undefined && options.ttl <= 0) {
      logger.warn(`LRUCache: Invalid ttl (${options.ttl}). Using default: ${this.ttl}ms`);
    }
  }

  // Get an item from the cache
  get(key: string): T | undefined {
    // Skip if key is undefined or null
    if (!key) return undefined;

    const item = this.cache.get(key);

    // Return undefined if item doesn't exist
    if (!item) return undefined;

    // Check if the item has expired
    if (Date.now() - item.timestamp > this.ttl) {
      this.delete(key);
      return undefined;
    }

    // Move item to the end of the Map to mark it as recently used
    this.cache.delete(key);
    this.cache.set(key, item);

    return item.value;
  }

  // Set an item in the cache
  set(key: string, value: T): void {
    // Skip if key is undefined or null
    if (!key) return;

    // If key already exists, update it
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // If cache is at capacity, remove the oldest item
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;

      // Ensure oldestKey is valid before proceeding
      if (oldestKey !== undefined) {
        const oldestValue = this.cache.get(oldestKey)?.value;

        if (oldestValue && this.onEvict) {
          this.onEvict(oldestKey, oldestValue);
        }

        this.cache.delete(oldestKey);
      }
    }

    // Add the new item
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  // Delete an item from the cache
  delete(key: string): boolean {
    // Skip if key is undefined or null
    if (!key) return false;

    const item = this.cache.get(key);

    if (item && this.onEvict) {
      this.onEvict(key, item.value);
    }

    return this.cache.delete(key);
  }

  // Check if cache has an item and it's not expired
  has(key: string): boolean {
    // Skip if key is undefined or null
    if (!key) return false;

    const item = this.cache.get(key);
    if (!item) return false;

    // Check expiration
    if (Date.now() - item.timestamp > this.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  // Clear all items from the cache
  clear(): void {
    if (this.onEvict) {
      this.cache.forEach((item, key) => {
        this.onEvict!(key, item.value);
      });
    }

    this.cache.clear();
  }

  // Get the number of items in the cache
  get size(): number {
    return this.cache.size;
  }

  // Clean up expired items
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    this.cache.forEach((item, key) => {
      if (now - item.timestamp > this.ttl) {
        if (this.onEvict) {
          this.onEvict(key, item.value);
        }
        this.cache.delete(key);
        removedCount++;
      }
    });

    return removedCount;
  }

  // Get all keys in the cache
  keys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// CacheManager to handle multiple caches
export class CacheManager {
  private caches: Map<string, LRUCache<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(cleanupIntervalMs: number = 60000) {
    // Validate cleanup interval
    const validInterval = cleanupIntervalMs > 0 ? cleanupIntervalMs : 60000;

    // Set up automatic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupAll();
    }, validInterval);

    if (cleanupIntervalMs <= 0) {
      logger.warn(
        `CacheManager: Invalid cleanupIntervalMs (${cleanupIntervalMs}). Using default: ${validInterval}ms`,
      );
    }
  }

  // Create or get a cache
  getCache<T>(name: string, options: CacheOptions = {}): LRUCache<T> {
    // Skip if name is undefined or null
    if (!name) throw new Error('Cache name is required');

    if (!this.caches.has(name)) {
      this.caches.set(name, new LRUCache<T>(options));
    }
    return this.caches.get(name) as LRUCache<T>;
  }

  // Remove a cache
  removeCache(name: string): boolean {
    // Skip if name is undefined or null
    if (!name) return false;

    const cache = this.caches.get(name);
    if (cache) {
      cache.clear();
      return this.caches.delete(name);
    }
    return false;
  }

  // Clean up all caches
  cleanupAll(): void {
    let totalRemoved = 0;
    this.caches.forEach((cache) => {
      totalRemoved += cache.cleanup();
    });

    if (totalRemoved > 0) {
      console.log(`CacheManager: Removed ${totalRemoved} expired items`);
    }
  }

  // Destroy the cache manager and clean up resources
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.caches.forEach((cache) => cache.clear());
    this.caches.clear();
  }
}

// Create a global instance of the cache manager
export const globalCacheManager = new CacheManager();
