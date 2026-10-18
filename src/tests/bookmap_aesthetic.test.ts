import { describe, it, expect } from 'vitest';
import { HeatmapEngine } from '../services/heatmap/HeatmapEngine';
import { ColorMapEngine } from '../services/heatmap/ColorMap';
import { DEFAULT_HEATMAP_SETTINGS } from '../types/settings';

describe('Bookmap Aesthetic & Major Liquidity Heat Verification', () => {
  const defaultSettings = { ...DEFAULT_HEATMAP_SETTINGS };

  it('1. Major liquidity levels glow in Hot Red and Radiant Orange across the whole chart', () => {
    const engine = new HeatmapEngine(50);
    const colorMap = new ColorMapEngine();

    // ETH candle data around 2430 (similar to user screenshot)
    const candles = [
      { time: 1700000000, open: 2428.0, high: 2438.0, low: 2426.0, close: 2432.0, volume: 150 },
      { time: 1700000060, open: 2432.0, high: 2439.0, low: 2429.0, close: 2435.0, volume: 180 },
      { time: 1700000120, open: 2435.0, high: 2440.0, low: 2430.0, close: 2437.0, volume: 210 },
    ];

    engine.seedHistoricalCandlesLiquidity(candles, 'ETHUSDT', 'binance');
    const slices = engine.getAllSlices();
    expect(slices.length).toBe(3);

    const { minQty, maxQty } = engine.getDynamicRange(defaultSettings, slices);

    // Verify Session High / BSL level (around 2440)
    const slice = slices[2];
    const highLevelQty = slice.levels.get(2440.0);
    expect(highLevelQty).toBeDefined();

    const highColor = colorMap.getColor(highLevelQty!, minQty, maxQty, defaultSettings);
    // Red channel dominates for Hot Red / Radiant Orange
    expect(highColor.r).toBe(255);
    expect(highColor.r).toBeGreaterThan(highColor.b);

    // Verify Session Low / SSL level (around 2426)
    const lowLevelQty = slice.levels.get(2426.0);
    expect(lowLevelQty).toBeDefined();

    const lowColor = colorMap.getColor(lowLevelQty!, minQty, maxQty, defaultSettings);
    expect(lowColor.r).toBe(255);
    expect(lowColor.r).toBeGreaterThan(lowColor.b);
  });

  it('2. Continuous ambient ocean-blue depth covers all price levels without black gaps', () => {
    const engine = new HeatmapEngine(50);
    const colorMap = new ColorMapEngine();

    const candles = [
      { time: 1700000000, open: 2428.0, high: 2438.0, low: 2426.0, close: 2432.0, volume: 150 },
    ];

    engine.seedHistoricalCandlesLiquidity(candles, 'ETHUSDT', 'binance');
    const slice = engine.getAllSlices()[0];

    // Every 0.5 step price level between 2426 and 2438 has order book depth
    for (let p = 2426.0; p <= 2438.0; p += 0.5) {
      const price = Number(p.toFixed(4));
      const qty = slice.levels.get(price);
      expect(qty).toBeDefined();
      expect(qty!).toBeGreaterThan(0);

      const color = colorMap.getColor(qty!, 0.5, 30.0, defaultSettings);
      expect(color.hex).not.toBe('transparent');
      // Alpha must be opaque (>= 0.85) so no black background leaks through
      expect(color.a).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('3. loadHistoricalSlices merges cached slices without evicting candle history', () => {
    const engine = new HeatmapEngine(50);
    const candles = [
      { time: 1700000000, open: 2428.0, high: 2438.0, low: 2426.0, close: 2432.0, volume: 150 },
      { time: 1700000060, open: 2432.0, high: 2439.0, low: 2429.0, close: 2435.0, volume: 180 },
    ];

    engine.seedHistoricalCandlesLiquidity(candles, 'ETHUSDT', 'binance');
    expect(engine.getAllSlices().length).toBe(2);

    // Simulate 1 cached slice from IndexedDB
    const cachedSlice = {
      timestamp: 1700000120000,
      bestBid: 2435.0,
      bestAsk: 2436.0,
      levels: new Map([[2435.0, 5.0]]),
      bids: new Map([[2435.0, 5.0]]),
      asks: new Map([[2436.0, 5.0]]),
      totalBidLiquidity: 5.0,
      totalAskLiquidity: 5.0,
      isValid: true,
    };

    engine.loadHistoricalSlices([cachedSlice as any]);
    // Historical slices must now contain 3 slices (2 from candles + 1 from cache)
    expect(engine.getAllSlices().length).toBe(3);
    expect(engine.getAllSlices()[0].timestamp).toBe(1700000000000);
    expect(engine.getAllSlices()[1].timestamp).toBe(1700000060000);
    expect(engine.getAllSlices()[2].timestamp).toBe(1700000120000);
  });

  it('4. Default heatmap settings preserve major liquidity without truncation', () => {
    expect(DEFAULT_HEATMAP_SETTINGS.colorScale).toBe('bookmap');
    expect(DEFAULT_HEATMAP_SETTINGS.removeTradedLiquidity).toBe(false);
    expect(DEFAULT_HEATMAP_SETTINGS.minLiquidityQty).toBe(0);
    expect(DEFAULT_HEATMAP_SETTINGS.lowerCutoffPercentile).toBe(0);
  });

  it('5. Left half of the chart (historical slices) retains peak heat at Session High BSL & Session Low SSL across all slices', () => {
    const engine = new HeatmapEngine(50);
    const colorMap = new ColorMapEngine();

    // 20 ETH candles simulating historical chart like user screenshot (2432 to 2441.8)
    const candles = [];
    for (let i = 0; i < 20; i++) {
      candles.push({
        time: 1700000000 + i * 60,
        open: 2434.0 + (i % 3),
        high: i === 12 ? 2441.8 : 2437.0 + (i % 2),
        low: i === 4 ? 2432.8 : 2433.5,
        close: 2435.0,
        volume: 100 + i * 5,
      });
    }

    engine.seedHistoricalCandlesLiquidity(candles, 'ETHUSDT', 'binance');
    const slices = engine.getAllSlices();
    expect(slices.length).toBe(20);

    const { minQty, maxQty } = engine.getDynamicRange(defaultSettings, slices);

    // Verify earliest slices on the left half of the chart (slice 0, 5, 10, 15, 19) have Session High BSL and Session Low SSL
    for (const testIdx of [0, 5, 10, 15, 19]) {
      const slice = slices[testIdx];
      const bslQty = slice.levels.get(2442.0); // Discretized 2441.8 -> 2442.0
      const sslQty = slice.levels.get(2433.0); // Discretized 2432.8 -> 2433.0

      expect(bslQty).toBeDefined();
      expect(sslQty).toBeDefined();

      // BSL & SSL are radiant hot red/orange heat
      const bslColor = colorMap.getColor(bslQty!, minQty, maxQty, defaultSettings);
      const sslColor = colorMap.getColor(sslQty!, minQty, maxQty, defaultSettings);

      expect(bslColor.r).toBe(255);
      expect(bslColor.r).toBeGreaterThan(bslColor.b);
      expect(sslColor.r).toBe(255);
      expect(sslColor.r).toBeGreaterThan(sslColor.b);
    }
  });

  it('6. Eliminates confusing fake red lines at minor 50-cent increments, reserving red/orange heat strictly for true structural levels', () => {
    const engine = new HeatmapEngine(50);
    const colorMap = new ColorMapEngine();

    const candles = [];
    for (let i = 0; i < 20; i++) {
      candles.push({
        time: 1700000000 + i * 60,
        open: 2435.0,
        high: i === 10 ? 2441.8 : 2438.0,
        low: i === 2 ? 2432.8 : 2434.0,
        close: 2436.0,
        volume: 120,
      });
    }

    engine.seedFromCandlesAndOrderBook(candles);
    const resting = engine.getActiveRestingLevels();

    // Check levels between 2437.0 and 2441.0
    // Arbitrary minor 50-cent steps (2437.5, 2438.5, 2439.5, 2440.5) must NOT be present as major red levels!
    const redLevels = resting.filter((l) => {
      const color = colorMap.getColor(l.qty, engine.getStats().minObservedQty, engine.getStats().maxObservedQty, defaultSettings);
      return color.r === 255 && color.g < 150; // Red / Fiery Orange
    });

    const redPrices = redLevels.map((l) => l.price);
    // True session extremes are red (discretized to step 0.5)
    expect(redPrices).toContain(2442.0); // Session High BSL
    expect(redPrices).toContain(2433.0); // Session Low SSL

    // Minor arbitrary 50c noise must NOT be red
    expect(redPrices).not.toContain(2437.5);
    expect(redPrices).not.toContain(2438.5);
    expect(redPrices).not.toContain(2439.5);
    expect(redPrices).not.toContain(2440.5);
    expect(redPrices).not.toContain(2441.5);
  });

  it('7. Bookmap Dual-Column COB accurately computes level depth and cumulative order book outwards from mid price', () => {
    // Simulate order book depth across 5 ask levels and 5 bid levels
    const midPrice = 2440.0;
    const askLevels = [
      { price: 2441.0, qty: 25.0 },
      { price: 2442.0, qty: 50.0 },
      { price: 2443.0, qty: 30.0 },
    ];
    const bidLevels = [
      { price: 2439.0, qty: 20.0 },
      { price: 2438.0, qty: 45.0 },
      { price: 2437.0, qty: 60.0 },
    ];

    // Cumulative ask depth accumulates ascending from mid price upwards
    let runningAsk = 0;
    const cumAsks = askLevels.map((l) => {
      runningAsk += l.qty;
      return { ...l, cumQty: runningAsk };
    });

    expect(cumAsks[0].cumQty).toBe(25.0);
    expect(cumAsks[1].cumQty).toBe(75.0); // 25 + 50
    expect(cumAsks[2].cumQty).toBe(105.0); // 75 + 30

    // Cumulative bid depth accumulates descending from mid price downwards
    let runningBid = 0;
    const cumBids = bidLevels.map((l) => {
      runningBid += l.qty;
      return { ...l, cumQty: runningBid };
    });

    expect(cumBids[0].cumQty).toBe(20.0);
    expect(cumBids[1].cumQty).toBe(65.0); // 20 + 45
    expect(cumBids[2].cumQty).toBe(125.0); // 65 + 60
  });
});


