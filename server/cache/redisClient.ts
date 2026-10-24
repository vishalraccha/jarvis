/**
 * JARVIS Hot Cache Layer (Redis with In-Memory LRU Fallback)
 * Zero-cost, high-availability, fail-safe caching for recent candles & tickers
 */

import { Redis } from 'ioredis';

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

export class HotCacheManager {
  private redis: Redis | null = null;
  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private maxMemoryKeys = 2000;
  private isRedisHealthy = false;
  private hits = 0;
  private misses = 0;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl && redisUrl.trim().length > 0) {
      try {
        console.log(`[HotCacheManager] Connecting to external Redis at ${redisUrl.replace(/:[^:]*@/, ':***@')}`);
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 2,
          connectTimeout: 3000,
          retryStrategy(times) {
            if (times > 3) {
              console.warn('[HotCacheManager] Redis connection failed after 3 attempts. Using local high-speed LRU fallback.');
              return null; // Stop retrying and fall back to local LRU
            }
            return Math.min(times * 500, 2000);
          },
          lazyConnect: true,
        });

        this.redis.on('connect', () => {
          this.isRedisHealthy = true;
          console.log('[HotCacheManager] Redis hot cache connected successfully.');
        });

        this.redis.on('error', (err) => {
          this.isRedisHealthy = false;
          console.warn('[HotCacheManager] Redis error (operating in local fallback mode):', err.message);
        });

        this.redis.connect().catch(() => {
          this.isRedisHealthy = false;
        });
      } catch (err) {
        console.warn('[HotCacheManager] Could not initialize Redis client, falling back to local memory cache:', err);
        this.redis = null;
      }
    } else {
      console.log('[HotCacheManager] No REDIS_URL configured. Initializing embedded zero-allocation LRU hot cache.');
    }
  }

  async get(key: string): Promise<string | null> {
    // 1. Try Redis if connected
    if (this.redis && this.isRedisHealthy) {
      try {
        const val = await this.redis.get(key);
        if (val !== null) {
          this.hits++;
          return val;
        }
      } catch {
        // Fall back to memory cache on Redis read failure
      }
    }

    // 2. Try in-memory LRU fallback
    const entry = this.memoryCache.get(key);
    if (entry) {
      if (entry.expiresAt > Date.now()) {
        this.hits++;
        // Refresh position for LRU
        this.memoryCache.delete(key);
        this.memoryCache.set(key, entry);
        return entry.value;
      }
      this.memoryCache.delete(key);
    }

    this.misses++;
    return null;
  }

  async set(key: string, value: string, ttlSeconds: number = 60): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;

    // 1. Set in local memory cache
    if (this.memoryCache.size >= this.maxMemoryKeys) {
      // Evict oldest 100 keys
      const iter = this.memoryCache.keys();
      for (let i = 0; i < 100; i++) {
        const next = iter.next();
        if (next.done) break;
        this.memoryCache.delete(next.value);
      }
    }
    this.memoryCache.set(key, { value, expiresAt });

    // 2. Set in Redis asynchronously if connected
    if (this.redis && this.isRedisHealthy) {
      try {
        await this.redis.set(key, value, 'EX', ttlSeconds);
      } catch (err) {
        console.warn('[HotCacheManager] Redis set error:', err);
      }
    }
  }

  async del(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (this.redis && this.isRedisHealthy) {
      try {
        await this.redis.del(key);
      } catch {}
    }
  }

  getStats(): {
    isRedisConnected: boolean;
    hits: number;
    misses: number;
    hitRate: string;
    memoryKeysCount: number;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : '0.0%';
    return {
      isRedisConnected: this.isRedisHealthy,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      memoryKeysCount: this.memoryCache.size,
    };
  }
}

export const hotCache = new HotCacheManager();
