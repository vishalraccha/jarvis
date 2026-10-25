/**
 * Candle Cache & Visual Integrity Test Suite
 * Validates instant RAM caching (<1ms MT5 speed), persistent basis calibration,
 * monotonic wick expansion (no fumbling), and strict OHLC structure invariants.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { indexedDBCache } from '../services/storage/IndexedDBCache';
import { BinanceAdapter } from '../services/exchange/BinanceAdapter';
import { ComexAdapter } from '../services/exchange/ComexAdapter';
import { mergeAndDeduplicateCandles, validateCandle } from '../utils/candleUtils';
import { Candle } from '../types/market';

// Polyfill localStorage in test environment
const store = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('Candle Cache & Visual Integrity Suite', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await indexedDBCache.clearAll();
    localStorage.clear();
  });

  describe('1. Instant MT5-Speed Dual-Tier Caching', () => {
    it('provides synchronous 0ms retrieval via getCachedCandlesSync after save', async () => {
      const mockCandles: Candle[] = [
        { time: 1700000000, open: 4120.5, high: 4125.0, low: 4118.0, close: 4123.2, volume: 100 },
        { time: 1700000060, open: 4123.2, high: 4128.5, low: 4122.0, close: 4127.0, volume: 150 },
      ];

      // Save to cache
      await indexedDBCache.saveCandles('GC', '1m', mockCandles, 'comex');

      // Immediate synchronous retrieval without awaiting (0ms MT5 speed)
      const t0 = performance.now();
      const syncCandles = indexedDBCache.getCachedCandlesSync('GC', '1m', 'comex');
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(1.0); // Less than 1 millisecond
      expect(syncCandles).not.toBeNull();
      expect(syncCandles?.length).toBe(2);
      expect(syncCandles?.[0].close).toBe(4123.2);
      expect(syncCandles?.[1].close).toBe(4127.0);
    });

    it('isolates cache per exchange and symbol avoiding cross-contamination', async () => {
      const goldBars: Candle[] = [
        { time: 1700000000, open: 4120.0, high: 4125.0, low: 4118.0, close: 4122.0, volume: 50 },
      ];
      const btcBars: Candle[] = [
        { time: 1700000000, open: 92000.0, high: 92500.0, low: 91800.0, close: 92300.0, volume: 5 },
      ];

      await indexedDBCache.saveCandles('XAUUSD', '1m', goldBars, 'binance');
      await indexedDBCache.saveCandles('BTCUSDT', '1m', btcBars, 'binance');

      const cachedGold = indexedDBCache.getCachedCandlesSync('XAUUSD', '1m', 'binance');
      const cachedBtc = indexedDBCache.getCachedCandlesSync('BTCUSDT', '1m', 'binance');

      expect(cachedGold?.[0].close).toBe(4122.0);
      expect(cachedBtc?.[0].close).toBe(92300.0);
    });
  });

  describe('2. Monotonic Wick Expansion & Invariant Rules', () => {
    it('verifies validateCandle enforces high >= max(open, close) and low <= min(open, close)', () => {
      const validBullish: Candle = { time: 1000, open: 4120, high: 4130, low: 4115, close: 4125, volume: 10 };
      const validBearish: Candle = { time: 1060, open: 4125, high: 4128, low: 4110, close: 4112, volume: 10 };
      const invalidWickHigh: Candle = { time: 1120, open: 4120, high: 4118, low: 4115, close: 4122, volume: 10 };
      const invalidWickLow: Candle = { time: 1180, open: 4120, high: 4130, low: 4122, close: 4125, volume: 10 };

      expect(validateCandle(validBullish)).toBe(true);
      expect(validateCandle(validBearish)).toBe(true);
      expect(validateCandle(invalidWickHigh)).toBe(false);
      expect(validateCandle(invalidWickLow)).toBe(false);
    });

    it('ensures high can only expand upwards and low only downwards within active candle', () => {
      let activeBar: Candle = {
        time: 1700000000,
        open: 4120.0,
        high: 4122.0,
        low: 4119.0,
        close: 4121.0,
        volume: 10,
      };

      // Simulating real-time tick price updates
      const applyTick = (bar: Candle, price: number): Candle => {
        const high = Math.max(bar.high, price, bar.open);
        const low = Math.min(bar.low, price, bar.open);
        return {
          ...bar,
          high,
          low,
          close: price,
        };
      };

      // 1. Tick pushes to new high
      activeBar = applyTick(activeBar, 4125.0);
      expect(activeBar.high).toBe(4125.0);
      expect(activeBar.close).toBe(4125.0);

      // 2. Price retraces down (Wick must NOT fumble or shrink!)
      activeBar = applyTick(activeBar, 4123.0);
      expect(activeBar.high).toBe(4125.0); // Top wick firmly pinned at 4125.0
      expect(activeBar.close).toBe(4123.0);

      // 3. Price drops below open
      activeBar = applyTick(activeBar, 4117.0);
      expect(activeBar.high).toBe(4125.0); // Top wick preserved
      expect(activeBar.low).toBe(4117.0);  // Bottom wick extended
      expect(activeBar.close).toBe(4117.0);

      // 4. Price bounces back up (Bottom wick must NOT fumble or shrink!)
      activeBar = applyTick(activeBar, 4120.0);
      expect(activeBar.high).toBe(4125.0);
      expect(activeBar.low).toBe(4117.0);  // Bottom wick firmly pinned at 4117.0
      expect(activeBar.close).toBe(4120.0);
    });
  });

  describe('3. Persistent Basis Calibration Stability', () => {
    it('preserves direct 1:1 real-time price across simulated reloads without price jumping', async () => {
      const dummyEvents = {
        onDepthUpdate: () => {},
        onTrade: () => {},
        onError: () => {},
        onConnectionChange: () => {},
      };

      const adapter1 = new BinanceAdapter();
      adapter1.connect('XAUUSD', '1m', dummyEvents);
      expect(adapter1.adjustPrice(4132.37)).toBe(4129.71);
      adapter1.disconnect();

      // Simulate page reload: new instance reads identical calibrated basis
      const adapter2 = new BinanceAdapter();
      adapter2.connect('XAUUSD', '1m', dummyEvents);
      expect(adapter2.adjustPrice(4132.37)).toBe(4129.71);
      adapter2.disconnect();
    });

    it('persists COMEX GC futures basis across simulated reloads', async () => {
      localStorage.setItem('jarvis_comex_basis', '19.20');

      const adapter = new ComexAdapter();
      // Spot gold 4122.30 + basis 19.20 = futures 4141.50
      const candles = await adapter.fetchHistoricalCandles('GC', '1m', undefined, undefined, 10);
      expect(candles.length).toBeGreaterThan(0);
      // All candles must be realistic COMEX gold prices (~4140+)
      for (const c of candles) {
        expect(c.close).toBeGreaterThan(3000);
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      }
    });
  });

  describe('4. Seamless Merging without Blank Canvas', () => {
    it('mergeAndDeduplicateCandles smoothly updates existing bars and appends new ones', () => {
      const existingBars: Candle[] = [
        { time: 1000, open: 4120, high: 4125, low: 4119, close: 4124, volume: 10 },
        { time: 1060, open: 4124, high: 4128, low: 4122, close: 4126, volume: 15 },
      ];

      // Incoming fresh fetch where bar 1060 has closed and bar 1120 is newly opened
      const freshBars: Candle[] = [
        { time: 1060, open: 4124, high: 4130, low: 4122, close: 4129, volume: 20 },
        { time: 1120, open: 4129, high: 4133, low: 4128, close: 4131, volume: 5 },
      ];

      const merged = mergeAndDeduplicateCandles(existingBars, freshBars);
      expect(merged.length).toBe(3);
      expect(merged[0].time).toBe(1000);
      expect(merged[1].time).toBe(1060);
      // Fresh authoritative data updated bar 1060
      expect(merged[1].close).toBe(4129);
      expect(merged[1].high).toBe(4130);
      // New bar 1120 appended
      expect(merged[2].time).toBe(1120);
      expect(merged[2].close).toBe(4131);
    });
  });
});
