import { describe, it, expect } from 'vitest';
import { mergeAndDeduplicateCandles, validateCandle } from '../utils/candleUtils';
import { ColorMapEngine } from '../services/heatmap/ColorMap';
import { HeatmapEngine } from '../services/heatmap/HeatmapEngine';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { DEFAULT_HEATMAP_SETTINGS, DEFAULT_DEPTH_PROFILE_SETTINGS } from '../types/settings';
import { Candle, MarketTrade } from '../types/market';

describe('Restoration Pipeline & Regression Tests', () => {
  describe('Candle Deduplication & Validation', () => {
    it('validates correct candle structures', () => {
      const valid: Candle = {
        time: 1700000000,
        open: 50000,
        high: 50500,
        low: 49800,
        close: 50200,
        volume: 12.5,
      };
      expect(validateCandle(valid)).toBe(true);

      const invalidHighLow: Candle = {
        time: 1700000000,
        open: 50000,
        high: 49000, // high < open
        low: 49800,
        close: 50200,
        volume: 12.5,
      };
      expect(validateCandle(invalidHighLow)).toBe(false);

      const invalidNaN: any = {
        time: 1700000000,
        open: NaN,
        high: 50500,
        low: 49800,
        close: 50200,
        volume: 12.5,
      };
      expect(validateCandle(invalidNaN)).toBe(false);
    });

    it('merges overlapping historical and live candles without duplicates or out-of-order bars', () => {
      const existing: Candle[] = [
        { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { time: 200, open: 11, high: 13, low: 10, close: 12, volume: 150 },
        { time: 300, open: 12, high: 14, low: 11, close: 13, volume: 200 },
      ];

      const incoming: Candle[] = [
        // Overlap bar 300 with updated close
        { time: 300, open: 12, high: 15, low: 11, close: 14, volume: 250 },
        // New bar 400
        { time: 400, open: 14, high: 16, low: 13, close: 15, volume: 180 },
      ];

      const merged = mergeAndDeduplicateCandles(existing, incoming);
      expect(merged.length).toBe(4);
      expect(merged.map((c) => c.time)).toEqual([100, 200, 300, 400]);
      // Updated bar 300 should take newer close
      expect(merged[2].close).toBe(14);
      expect(merged[2].high).toBe(15);
    });

    it('handles out-of-order incoming arrays by sorting strictly by timestamp', () => {
      const unsorted: Candle[] = [
        { time: 500, open: 1, high: 2, low: 1, close: 2, volume: 1 },
        { time: 100, open: 1, high: 2, low: 1, close: 2, volume: 1 },
        { time: 300, open: 1, high: 2, low: 1, close: 2, volume: 1 },
      ];
      const merged = mergeAndDeduplicateCandles([], unsorted);
      expect(merged.map((c) => c.time)).toEqual([100, 300, 500]);
    });
  });

  describe('Heatmap Color & Saturation Scaling', () => {
    it('provides multi-chromatic gradient from deep blue to bright yellow and red', () => {
      const engine = new ColorMapEngine();
      engine.rebuildLut('bookmap', 1.05, 1.0, 0.88);

      // Low quantity (near min)
      const lowColor = engine.getColor(0.5, 0.1, 100, DEFAULT_HEATMAP_SETTINGS);
      expect(lowColor).toBeDefined();
      expect(lowColor.a).toBeGreaterThan(0);
      expect(lowColor.hex).toBeDefined();

      // Medium-high quantity (should be yellow/cyan range)
      const midColor = engine.getColor(50, 0.1, 100, DEFAULT_HEATMAP_SETTINGS);
      expect(midColor).toBeDefined();

      // Peak quantity (red/orange range)
      const peakColor = engine.getColor(100, 0.1, 100, DEFAULT_HEATMAP_SETTINGS);
      expect(peakColor).toBeDefined();

      // Ensure colors are distinct across the spectrum
      expect(lowColor.hex).not.toEqual(peakColor.hex);
    });

    it('correctly maps tiered liquidity to distinct chromatic hues (navy -> cyan -> yellow -> orange -> red)', () => {
      const engine = new ColorMapEngine();
      engine.rebuildLut('bookmap', 1.05, 1.0, 0.88);

      // Low order: should be navy / blue (r low, b high)
      const navyColor = engine.getColor(0.5, 0.1, 100, DEFAULT_HEATMAP_SETTINGS);
      expect(navyColor.b).toBeGreaterThan(navyColor.r);

      // Mid-high order: should be golden yellow (r high, g high, b low)
      const yellowColor = engine.getColor(40, 0.1, 100, DEFAULT_HEATMAP_SETTINGS);
      expect(yellowColor.r).toBeGreaterThan(200);
      expect(yellowColor.g).toBeGreaterThan(150);

      // Whale peak order: should be hot crimson/red (r high, g low, b low)
      const redColor = engine.getColor(95, 0.1, 100, DEFAULT_HEATMAP_SETTINGS);
      expect(redColor.r).toBe(255);
      expect(redColor.g).toBeLessThan(120);
    });

    it('retains default settings that prevent thin line regression', () => {
      expect(DEFAULT_HEATMAP_SETTINGS.minLiquidityQty).toBeLessThanOrEqual(0.1);
      expect(DEFAULT_HEATMAP_SETTINGS.minLiquidityNotional).toBe(0);
      expect(DEFAULT_HEATMAP_SETTINGS.lowerCutoffPercentile).toBeLessThanOrEqual(5);
      expect(DEFAULT_HEATMAP_SETTINGS.showZoneOutlines).toBe(false);
      expect(DEFAULT_HEATMAP_SETTINGS.opacity).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Current Order Book (COB) Profile & Range Query', () => {
    it('has valid default layout and display configuration', () => {
      expect(DEFAULT_DEPTH_PROFILE_SETTINGS.enabled).toBe(true);
      expect(DEFAULT_DEPTH_PROFILE_SETTINGS.widthPx).toBeGreaterThanOrEqual(140);
      expect(DEFAULT_DEPTH_PROFILE_SETTINGS.maxLevels).toBeGreaterThanOrEqual(50);
      expect(DEFAULT_DEPTH_PROFILE_SETTINGS.bidColor).toBeDefined();
      expect(DEFAULT_DEPTH_PROFILE_SETTINGS.askColor).toBeDefined();
    });
  });

  describe('Resting Liquidity & Trade Consumption (User Requirements)', () => {
    it('maintains stable band quantities and does not automatically fluctuate without trades', async () => {
      const engine = new HeatmapEngine(100);
      const ob = new OrderBookManager(0.01);

      const mockAdapter = {
        fetchDepthSnapshot: async () => ({
          lastUpdateId: 100,
          timestamp: Date.now(),
          bids: [
            [100, 15.0] as [number, number],
            [99, 25.0] as [number, number],
          ],
          asks: [
            [101, 20.0] as [number, number],
            [102, 35.0] as [number, number],
          ],
        }),
        fetchRecentTrades: async () => [],
      };

      await ob.synchronize(mockAdapter as any, 'BTCUSDT');

      const slice1 = engine.sampleOrderBook(ob, 100);
      expect(slice1).not.toBeNull();
      expect(slice1?.levels.get(102)).toBe(35.0);

      // Verify active resting levels match
      const walls1 = engine.getActiveRestingLevels();
      const wall102 = walls1.find((w) => w.price === 102);
      expect(wall102).toBeDefined();
      expect(wall102?.qty).toBe(35.0);

      // Another check without trades: quantity remains identical (rock-solid, no color/qty change)
      await new Promise((r) => setTimeout(r, 110));
      const slice2 = engine.sampleOrderBook(ob, 100);
      expect(slice2).not.toBeNull();
      expect(slice2?.levels.get(102)).toBe(35.0);
      expect(engine.getActiveRestingLevels().find((w) => w.price === 102)?.qty).toBe(35.0);
    });

    it('updates liquidity ONLY when price trades at that level, and removes when all limit orders got hit', async () => {
      const engine = new HeatmapEngine(100);
      const ob = new OrderBookManager(0.01);

      const mockAdapter = {
        fetchDepthSnapshot: async () => ({
          lastUpdateId: 100,
          timestamp: Date.now(),
          bids: [[99, 10.0] as [number, number]],
          asks: [[105, 5.0] as [number, number]],
        }),
        fetchRecentTrades: async () => [],
      };

      await ob.synchronize(mockAdapter as any, 'BTCUSDT');

      engine.sampleOrderBook(ob, 100);
      let walls = engine.getActiveRestingLevels();
      expect(walls.find((w) => w.price === 105)?.qty).toBe(5.0);

      // Trade at unrelated price: resting level 105 must NOT be touched
      const tradeAway: MarketTrade = {
        id: '1',
        timestamp: Date.now(),
        price: 100.5,
        quantity: 2.0,
        notional: 201,
        side: 'buy',
        isBuyerMaker: false,
      };
      engine.recordTrade(tradeAway, 100);
      walls = engine.getActiveRestingLevels();
      expect(walls.find((w) => w.price === 105)?.qty).toBe(5.0);

      // Trade at price 105 for 2.0: resting quantity depletes from 5.0 to 3.0
      const tradeHit: MarketTrade = {
        id: '2',
        timestamp: Date.now(),
        price: 105.0,
        quantity: 2.0,
        notional: 210,
        side: 'buy',
        isBuyerMaker: false,
      };
      engine.recordTrade(tradeHit, 100);
      walls = engine.getActiveRestingLevels();
      expect(walls.find((w) => w.price === 105)?.qty).toBe(3.0);

      // Trade at price 105 consuming remaining 3.0: all limit orders got hit! Level is cleared
      const tradeSweep: MarketTrade = {
        id: '3',
        timestamp: Date.now(),
        price: 105.0,
        quantity: 3.5,
        notional: 367.5,
        side: 'buy',
        isBuyerMaker: false,
      };
      engine.recordTrade(tradeSweep, 100);
      walls = engine.getActiveRestingLevels();
      expect(walls.find((w) => w.price === 105)).toBeUndefined();
    });

    it('calibrates dynamic range properly when resting levels are present', async () => {
      const engine = new HeatmapEngine(100);
      const ob = new OrderBookManager(0.01);

      const mockAdapter = {
        fetchDepthSnapshot: async () => ({
          lastUpdateId: 100,
          timestamp: Date.now(),
          bids: [
            [100, 1.0] as [number, number],
            [99, 2.0] as [number, number],
            [98, 5.0] as [number, number],
            [97, 8.0] as [number, number],
            [96, 12.0] as [number, number],
            [95, 20.0] as [number, number],
          ],
          asks: [
            [101, 1.5] as [number, number],
            [102, 3.0] as [number, number],
            [103, 6.0] as [number, number],
            [104, 10.0] as [number, number],
            [105, 15.0] as [number, number],
            [106, 25.0] as [number, number],
          ],
        }),
        fetchRecentTrades: async () => [],
      };

      await ob.synchronize(mockAdapter as any, 'BTCUSDT');
      engine.sampleOrderBook(ob, 100);

      const { minQty, maxQty } = engine.getDynamicRange(DEFAULT_HEATMAP_SETTINGS);
      expect(minQty).toBeGreaterThan(0);
      expect(maxQty).toBeGreaterThan(minQty);
      expect(maxQty).toBeLessThanOrEqual(100); // Reasonably calibrated, not stuck at arbitrary 350
    });

    it('inspects resting levels accurately even without pre-existing historical slices', async () => {
      const engine = new HeatmapEngine(100);
      const ob = new OrderBookManager(0.01);

      const mockAdapter = {
        fetchDepthSnapshot: async () => ({
          lastUpdateId: 100,
          timestamp: Date.now(),
          bids: [[100, 15.0] as [number, number]],
          asks: [[105, 30.0] as [number, number]],
        }),
        fetchRecentTrades: async () => [],
      };

      await ob.synchronize(mockAdapter as any, 'BTCUSDT');
      engine.sampleOrderBook(ob, 100);

      const inspection = engine.inspectPoint(105.0, Date.now() - 5000);
      expect(inspection.hasObservation).toBe(true);
      expect(inspection.currentQty).toBe(30.0);
      expect(inspection.classification).toBe('ACTIVE LIQUIDITY');
    });

    it('handles out-of-range bounds gracefully in getVisibleSlices', () => {
      const engine = new HeatmapEngine(100);
      const slices = engine.getVisibleSlices(1000, 2000);
      expect(slices).toEqual([]);
    });
  });
});
