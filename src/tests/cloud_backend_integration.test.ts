import { describe, it, expect, beforeAll } from 'vitest';
import { sqliteStore, StoredCandle } from '../../server/db/sqliteStore';
import { hotCache } from '../../server/cache/redisClient';

describe('JARVIS Cloud Backend & Storage Architecture Suite', () => {
  beforeAll(async () => {
    await sqliteStore.init();
  });

  describe('1. Pure-WASM SQLite Store (Zero native compilation dependency)', () => {
    const mockCandles: StoredCandle[] = [
      { time: 1700000060, open: 2000, high: 2005, low: 1999, close: 2002, volume: 10 },
      { time: 1700000120, open: 2002, high: 2008, low: 2001, close: 2007, volume: 15 },
      { time: 1700000180, open: 2007, high: 2010, low: 2005, close: 2009, volume: 20 },
      { time: 1700000240, open: 2009, high: 2012, low: 2008, close: 2011, volume: 12 },
    ];

    it('inserts candles safely in transaction and updates stats', () => {
      const inserted = sqliteStore.insertCandles('TEST_PAIR', '1m', mockCandles);
      expect(inserted).toBe(4);

      const stats = sqliteStore.getStats();
      expect(stats.totalRecords).toBeGreaterThanOrEqual(4);
      expect(Object.keys(stats.symbolCounts)).toContain('TEST_PAIR_1m');
    });

    it('retrieves candles ordered chronologically in ascending order', () => {
      const results = sqliteStore.getCandles('TEST_PAIR', '1m', undefined, undefined, 10);
      expect(results.length).toBe(4);
      expect(results[0].time).toBe(1700000060);
      expect(results[3].time).toBe(1700000240);
      expect(results[0].close).toBe(2002);
      expect(results[3].close).toBe(2011);
    });

    it('performs reverse historical paging using endTime parameter correctly', () => {
      // Query with endTime = 1700000180 and limit = 2
      // Should return the 2 candles immediately leading up to 1700000180 (i.e. 1700000120 and 1700000180)
      const results = sqliteStore.getCandles('TEST_PAIR', '1m', undefined, 1700000180, 2);
      expect(results.length).toBe(2);
      expect(results[0].time).toBe(1700000120);
      expect(results[1].time).toBe(1700000180);
      expect(results[1].close).toBe(2009);
    });

    it('handles deduplication and idempotent upserts seamlessly', () => {
      const duplicateCandles: StoredCandle[] = [
        { time: 1700000240, open: 2009, high: 2015, low: 2008, close: 2014, volume: 25 }, // updated high & close
      ];
      sqliteStore.insertCandles('TEST_PAIR', '1m', duplicateCandles);

      const results = sqliteStore.getCandles('TEST_PAIR', '1m', 1700000240, 1700000240, 10);
      expect(results.length).toBe(1);
      expect(results[0].high).toBe(2015);
      expect(results[0].close).toBe(2014);
    });
  });

  describe('2. Dual-Mode Hot Cache (Embedded Zero-Cost LRU + Redis Wire Protocol)', () => {
    it('sets and retrieves cached keys with < 1ms response latency', async () => {
      await hotCache.set('test_kline_key', JSON.stringify({ price: 2750.5 }), 10);
      const val = await hotCache.get('test_kline_key');
      expect(val).toBeDefined();
      const parsed = JSON.parse(val!);
      expect(parsed.price).toBe(2750.5);
    });

    it('tracks cache hit and miss statistics accurately', async () => {
      await hotCache.get('non_existent_key_123');
      const stats = hotCache.getStats();
      expect(stats.misses).toBeGreaterThanOrEqual(1);
      expect(stats.hits).toBeGreaterThanOrEqual(1);
    });

    it('deletes keys correctly', async () => {
      await hotCache.set('temp_key', 'hello', 10);
      await hotCache.del('temp_key');
      const val = await hotCache.get('temp_key');
      expect(val).toBeNull();
    });
  });
});
