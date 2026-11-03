/**
 * JARVIS Server-Side Heatmap & Preferences Hot Cache Service
 * Powered by Redis Hot Cache with high-speed memory fallback.
 * Zero browser storage, zero IndexedDB, zero local disk load.
 */

import { hotCache } from '../../cache/redisClient.js';

export interface ServerHeatmapRecord {
  id: string;
  symbol: string;
  timestamp: number;
  bestBid: number;
  bestAsk: number;
  levels: [number, number, number][];
}

export class HeatmapCacheService {
  private inMemoryMap: Map<string, ServerHeatmapRecord[]> = new Map();
  private readonly maxSlicesPerSymbol = 500; // Rolling depth window
  private cachedPreferences: any = null;

  private getRedisKey(symbol: string): string {
    const clean = (symbol || 'XAUUSD').toUpperCase().replace(/[-_/]/g, '');
    return `jarvis:heatmap:${clean}`;
  }

  public async saveSlices(symbol: string, newSlices: ServerHeatmapRecord[]): Promise<number> {
    if (!newSlices || newSlices.length === 0) return 0;
    const clean = (symbol || 'XAUUSD').toUpperCase().replace(/[-_/]/g, '');
    const key = this.getRedisKey(clean);

    let existing = this.inMemoryMap.get(clean) || [];
    if (existing.length === 0) {
      const fromRedis = await hotCache.get(key);
      if (fromRedis) {
        try {
          const parsed = JSON.parse(fromRedis);
          if (Array.isArray(parsed)) existing = parsed;
        } catch {}
      }
    }

    const sliceMap = new Map<number, ServerHeatmapRecord>();
    for (const s of existing) sliceMap.set(s.timestamp, s);
    for (const s of newSlices) sliceMap.set(s.timestamp, s);

    const merged = Array.from(sliceMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    const trimmed = merged.length > this.maxSlicesPerSymbol ? merged.slice(-this.maxSlicesPerSymbol) : merged;

    this.inMemoryMap.set(clean, trimmed);
    // Asynchronously update Redis hot cache (24 hour TTL)
    hotCache.set(key, JSON.stringify(trimmed), 86400).catch(() => {});
    return trimmed.length;
  }

  public async getSlices(symbol: string, startTimeMs: number = 0, limit: number = 400): Promise<ServerHeatmapRecord[]> {
    const clean = (symbol || 'XAUUSD').toUpperCase().replace(/[-_/]/g, '');
    const key = this.getRedisKey(clean);

    let list = this.inMemoryMap.get(clean);
    if (!list || list.length === 0) {
      const fromRedis = await hotCache.get(key);
      if (fromRedis) {
        try {
          const parsed = JSON.parse(fromRedis);
          if (Array.isArray(parsed)) {
            list = parsed;
            this.inMemoryMap.set(clean, list);
          }
        } catch {}
      }
    }

    if (!list || list.length === 0) return [];
    let filtered = list;
    if (startTimeMs > 0) {
      filtered = filtered.filter((s) => s.timestamp >= startTimeMs);
    }
    if (limit > 0 && filtered.length > limit) {
      filtered = filtered.slice(-limit);
    }
    return filtered;
  }

  public async savePreferences(prefs: any): Promise<void> {
    this.cachedPreferences = prefs;
    const serialized = JSON.stringify(prefs);
    await hotCache.set('jarvis:user:preferences', serialized, 86400 * 30); // 30 days
  }

  public async getPreferences(): Promise<any | null> {
    if (this.cachedPreferences) return this.cachedPreferences;
    const fromRedis = await hotCache.get('jarvis:user:preferences');
    if (fromRedis) {
      try {
        const parsed = JSON.parse(fromRedis);
        this.cachedPreferences = parsed;
        return parsed;
      } catch {}
    }
    return null;
  }
}

export const heatmapCacheService = new HeatmapCacheService();
