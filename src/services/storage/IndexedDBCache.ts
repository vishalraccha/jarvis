/**
 * IndexedDB Historical Cache for JARVIS Heatmap
 * Asynchronous, batched persistence for historical liquidity slices, klines & settings
 * JARVIS HEATMAP TERMINAL
 */

import { HeatmapTimeSlice } from '../../types/heatmap';
import { Candle, CandleTimeframe } from '../../types/market';
import { TerminalPreferences } from '../../types/settings';

interface StoredHeatmapRecord {
  id: string; // `${symbol}_${timestamp}`
  symbol: string;
  timestamp: number;
  bestBid: number;
  bestAsk: number;
  // Compact array of [price, bidQty, askQty]
  levels: [number, number, number][];
}

export interface CacheStatus {
  totalHeatmapRecords: number;
  totalCandleRecords: number;
  oldestRecordTime: number;
  newestRecordTime: number;
  estimatedSizeBytes: number;
}

export class IndexedDBCache {
  private dbName = 'jarvis_heatmap_cache_v1';
  private db: IDBDatabase | null = null;
  private isOpening = false;
  private pendingSliceBatch: StoredHeatmapRecord[] = [];
  private batchFlushTimer: number | null = null;

  async init(): Promise<void> {
    if (this.db || this.isOpening) return;
    this.isOpening = true;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store for heatmap slices
        if (!db.objectStoreNames.contains('heatmap_slices')) {
          const sliceStore = db.createObjectStore('heatmap_slices', { keyPath: 'id' });
          sliceStore.createIndex('symbol_timestamp', ['symbol', 'timestamp'], { unique: false });
          sliceStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Store for candles
        if (!db.objectStoreNames.contains('klines')) {
          const klineStore = db.createObjectStore('klines', { keyPath: 'id' });
          klineStore.createIndex('symbol_interval_time', ['symbol', 'interval', 'time'], { unique: false });
        }

        // Store for terminal user preferences
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.isOpening = false;
        resolve();
      };

      request.onerror = (event) => {
        this.isOpening = false;
        console.error('[IndexedDBCache] Failed to open IndexedDB:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  /**
   * Queue a slice for batched asynchronous persistence
   */
  queueSlice(symbol: string, slice: HeatmapTimeSlice): void {
    if (!this.db) return;

    // Convert map to compact array
    const levels: [number, number, number][] = [];
    for (const [p, bq] of slice.bids) {
      const aq = slice.asks.get(p) || 0;
      levels.push([p, bq, aq]);
    }
    for (const [p, aq] of slice.asks) {
      if (!slice.bids.has(p)) {
        levels.push([p, 0, aq]);
      }
    }

    const record: StoredHeatmapRecord = {
      id: `${symbol.toUpperCase()}_${slice.timestamp}`,
      symbol: symbol.toUpperCase(),
      timestamp: slice.timestamp,
      bestBid: slice.bestBid,
      bestAsk: slice.bestAsk,
      levels,
    };

    this.pendingSliceBatch.push(record);

    if (this.pendingSliceBatch.length >= 25) {
      this.flushBatch();
    } else if (!this.batchFlushTimer) {
      this.batchFlushTimer = window.setTimeout(() => this.flushBatch(), 5000);
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batchFlushTimer) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }

    if (!this.db || this.pendingSliceBatch.length === 0) return;

    const batch = [...this.pendingSliceBatch];
    this.pendingSliceBatch = [];

    try {
      const tx = this.db.transaction('heatmap_slices', 'readwrite');
      const store = tx.objectStore('heatmap_slices');
      for (const rec of batch) {
        store.put(rec);
      }
    } catch (e) {
      console.warn('[IndexedDBCache] Batch write error:', e);
    }
  }

  /**
   * Load genuine cached historical slices for symbol within time window
   */
  async loadSlices(
    symbol: string,
    startTimeMs: number = 0,
    endTimeMs: number = Number.MAX_SAFE_INTEGER
  ): Promise<HeatmapTimeSlice[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('heatmap_slices', 'readonly');
        const store = tx.objectStore('heatmap_slices');
        const index = store.index('symbol_timestamp');
        const sym = symbol.toUpperCase();
        const range = IDBKeyRange.bound([sym, startTimeMs], [sym, endTimeMs]);
        const req = index.getAll(range);

        req.onsuccess = () => {
          const records: StoredHeatmapRecord[] = req.result || [];
          const slices: HeatmapTimeSlice[] = records.map((rec) => {
            const levels = new Map<number, number>();
            const bids = new Map<number, number>();
            const asks = new Map<number, number>();
            let totalBid = 0;
            let totalAsk = 0;

            for (const [p, bq, aq] of rec.levels) {
              const tot = bq + aq;
              if (tot > 0) levels.set(p, tot);
              if (bq > 0) {
                bids.set(p, bq);
                totalBid += bq;
              }
              if (aq > 0) {
                asks.set(p, aq);
                totalAsk += aq;
              }
            }

            return {
              exchange: 'binance',
              symbol: rec.symbol,
              marketType: 'spot',
              timestamp: rec.timestamp,
              bestBid: rec.bestBid,
              bestAsk: rec.bestAsk,
              levels,
              bids,
              asks,
              totalBidLiquidity: totalBid,
              totalAskLiquidity: totalAsk,
              isValid: true,
              freshnessTimestamp: rec.timestamp,
            };
          });

          slices.sort((a, b) => a.timestamp - b.timestamp);
          resolve(slices);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * Save user terminal preferences
   */
  async savePreferences(prefs: TerminalPreferences): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    try {
      const tx = this.db.transaction('preferences', 'readwrite');
      const store = tx.objectStore('preferences');
      store.put({ key: 'user_preferences', value: prefs });
    } catch (e) {
      console.warn('[IndexedDBCache] Save preferences failed:', e);
    }
  }

  /**
   * Load stored preferences
   */
  async loadPreferences(): Promise<TerminalPreferences | null> {
    if (!this.db) await this.init();
    if (!this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('preferences', 'readonly');
        const store = tx.objectStore('preferences');
        const req = store.get('user_preferences');
        req.onsuccess = () => {
          if (req.result && req.result.value) {
            resolve(req.result.value);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Save batch of historical klines
   */
  async saveCandles(symbol: string, interval: CandleTimeframe, candles: Candle[]): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db || candles.length === 0) return;

    try {
      // Filter out rogue cross-symbol candles before persisting
      const sample = candles.slice(-30).map((c) => c.close).sort((a, b) => a - b);
      const median = sample[Math.floor(sample.length / 2)];
      const cleanCandles = median > 0
        ? candles.filter((c) => c.close >= median * 0.3 && c.close <= median * 3.0)
        : candles;

      const tx = this.db.transaction('klines', 'readwrite');
      const store = tx.objectStore('klines');
      for (const c of cleanCandles) {
        store.put({
          id: `${symbol}_${interval}_${c.time}`,
          symbol,
          interval,
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        });
      }
    } catch (e) {
      console.warn('[IndexedDBCache] Save candles error:', e);
    }
  }

  /**
   * Load cached candles
   */
  async loadCandles(symbol: string, interval: CandleTimeframe): Promise<Candle[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('klines', 'readonly');
        const store = tx.objectStore('klines');
        const index = store.index('symbol_interval_time');
        const range = IDBKeyRange.bound([symbol, interval, 0], [symbol, interval, Number.MAX_SAFE_INTEGER]);
        const req = index.getAll(range);

        req.onsuccess = () => {
          let list: Candle[] = (req.result || []).map((r: any) => ({
            time: r.time,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume,
          }));
          list.sort((a, b) => a.time - b.time);

          // Purge any cross-symbol corrupted outlier candles
          if (list.length > 0) {
            const sample = list.slice(-30).map((c) => c.close).sort((a, b) => a - b);
            const median = sample[Math.floor(sample.length / 2)];
            if (median > 0) {
              list = list.filter((c) => c.close >= median * 0.3 && c.close <= median * 3.0);
            }
          }

          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * Clear all cached data
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    try {
      const tx = this.db.transaction(['heatmap_slices', 'klines'], 'readwrite');
      tx.objectStore('heatmap_slices').clear();
      tx.objectStore('klines').clear();
    } catch (e) {
      console.warn('[IndexedDBCache] Clear cache error:', e);
    }
  }

  /**
   * Get cache diagnostics status
   */
  async getStatus(): Promise<CacheStatus> {
    if (!this.db) await this.init();
    if (!this.db) {
      return {
        totalHeatmapRecords: 0,
        totalCandleRecords: 0,
        oldestRecordTime: 0,
        newestRecordTime: 0,
        estimatedSizeBytes: 0,
      };
    }

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(['heatmap_slices', 'klines'], 'readonly');
        const sliceStore = tx.objectStore('heatmap_slices');
        const klineStore = tx.objectStore('klines');

        const sliceReq = sliceStore.count();
        const klineReq = klineStore.count();

        tx.oncomplete = () => {
          const slices = sliceReq.result || 0;
          const klines = klineReq.result || 0;
          // Approximate size: 1.5KB per slice, 80 bytes per candle
          const estimatedSize = slices * 1500 + klines * 80;

          resolve({
            totalHeatmapRecords: slices,
            totalCandleRecords: klines,
            oldestRecordTime: 0,
            newestRecordTime: Date.now(),
            estimatedSizeBytes: estimatedSize,
          });
        };
        tx.onerror = () => {
          resolve({
            totalHeatmapRecords: 0,
            totalCandleRecords: 0,
            oldestRecordTime: 0,
            newestRecordTime: 0,
            estimatedSizeBytes: 0,
          });
        };
      } catch {
        resolve({
          totalHeatmapRecords: 0,
          totalCandleRecords: 0,
          oldestRecordTime: 0,
          newestRecordTime: 0,
          estimatedSizeBytes: 0,
        });
      }
    });
  }
}

export const indexedDBCache = new IndexedDBCache();
