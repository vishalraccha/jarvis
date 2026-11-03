/**
 * JARVIS Cloud Hot Cache Proxy (IndexedDB legacy deprecation wrapper)
 * Zero browser storage, zero local disk load, zero IndexedDB.
 * Routes depth slices, candles & preferences through server-side Redis hot cache and ultra-fast session RAM.
 * JARVIS HEATMAP TERMINAL - PERFORMANCE EDITION
 */

import {
  RedisHotCacheService,
  redisHotCache,
  StoredHeatmapRecord,
  CacheStatus,
} from './CloudHotCache';

export {
  RedisHotCacheService,
  redisHotCache,
  RedisHotCacheService as IndexedDBCache,
  redisHotCache as indexedDBCache,
};

export type { StoredHeatmapRecord, CacheStatus };
