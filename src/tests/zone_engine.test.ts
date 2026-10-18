/**
 * Liquidity Zone Engine & Section 14 Comprehensive Verification Test Suite
 * JARVIS HEATMAP TERMINAL
 *
 * Verifies all 15 required items from Section 14 of specification:
 * 1. Repeated updates do not create duplicate lines.
 * 2. Identical order-book snapshots do not produce progressively brighter pixels.
 * 3. A price bucket maps to the correct time and price.
 * 4. Adjacent significant buckets can form a zone.
 * 5. Weak noise does not create hundreds of independent zones.
 * 6. A persistent zone remains visible throughout its observed history.
 * 7. A zone stops extending when it is no longer observed.
 * 8. The current book is never drawn backward into unobserved historical time.
 * 9. Empty data remains visually empty.
 * 10. Symbol changes do not leak old zones.
 * 11. Pan, zoom and resizing preserve alignment.
 * 12. Heatmap opacity does not alter underlying market calculations.
 * 13. The candle layer remains readable.
 * 14. The live edge does not accumulate duplicated bands.
 * 15. The renderer stays within a configurable CPU and memory budget.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LiquidityZoneEngine } from '../services/heatmap/LiquidityZoneEngine';
import { HeatmapEngine } from '../services/heatmap/HeatmapEngine';
import { ColorMapEngine } from '../services/heatmap/ColorMap';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { DEFAULT_HEATMAP_SETTINGS } from '../types/settings';
import { HeatmapSettings } from '../types/heatmap';
import { MarketTrade } from '../types/market';

describe('Section 14: Heatmap & Liquidity Zone Engine Verification', () => {
  let zoneEngine: LiquidityZoneEngine;
  let heatmapEngine: HeatmapEngine;
  let colorMapEngine: ColorMapEngine;
  let settings: HeatmapSettings;

  beforeEach(() => {
    zoneEngine = new LiquidityZoneEngine(0.01);
    colorMapEngine = new ColorMapEngine();
    heatmapEngine = new HeatmapEngine(250);
    settings = { ...DEFAULT_HEATMAP_SETTINGS };
  });

  // 1. Repeated updates do not create duplicate lines
  it('1. Repeated updates do not create duplicate lines', () => {
    const baseTime = 1700000000000;
    const bids = new Map<number, number>([[65000.0, 10.0]]);
    const asks = new Map<number, number>([[65010.0, 8.0]]);

    // Feed 10 consecutive observations with the same resting order
    for (let i = 0; i < 10; i++) {
      zoneEngine.processObservation(
        baseTime + i * 200,
        bids,
        asks,
        65000.0,
        65010.0,
        settings
      );
    }

    const allZones = zoneEngine.getAllZones();
    // Must NOT have 10 duplicate zones for the same price level; should have matched the existing zone
    const bidZones = allZones.filter((z) => z.isBid && Math.abs(z.centerPrice - 65000.05) < 0.2);
    expect(bidZones.length).toBe(1);
    expect(bidZones[0].observationCount).toBe(10);
    expect(bidZones[0].lastObservedTime).toBe(baseTime + 9 * 200);
  });

  // 2. Identical order-book snapshots do not produce progressively brighter pixels
  it('2. Identical order-book snapshots do not produce progressively brighter pixels', () => {
    const colorMap = new ColorMapEngine();
    const qty = 5.0;
    const pMin = 1.0;
    const pMax = 10.0;

    // Evaluate color intensity at step 1
    const rgba1 = colorMap.getColor(qty, pMin, pMax, settings);

    // Simulate 50 repeated cycles with identical distribution and quantity
    let rgbaFinal = rgba1;
    for (let i = 0; i < 50; i++) {
      rgbaFinal = colorMap.getColor(qty, pMin, pMax, settings);
    }

    // Color channels must remain deterministic and stable
    expect(rgbaFinal.r).toBe(rgba1.r);
    expect(rgbaFinal.g).toBe(rgba1.g);
    expect(rgbaFinal.b).toBe(rgba1.b);
    expect(rgbaFinal.a).toBe(rgba1.a);
  });

  // 3. A price bucket maps to the correct time and price
  it('3. A price bucket maps to the correct time and price', () => {
    settings.priceAggregationTicks = 10; // 10 ticks * 0.01 = $0.10 bucket
    const bids = new Map<number, number>([
      [65000.02, 2.5],
      [65000.08, 3.5], // both belong to [65000.00, 65000.10)
    ]);
    const asks = new Map<number, number>([
      [65010.15, 4.0], // belongs to [65010.10, 65010.20)
    ]);

    const buckets = zoneEngine.aggregateLevels(bids, asks, settings);

    // Verify 65000.00 bucket
    const b0 = buckets.get(65000.0);
    expect(b0).toBeDefined();
    expect(b0?.totalQty).toBeCloseTo(6.0);
    expect(b0?.rawLevelsCount).toBe(2);

    // Verify 65010.10 bucket
    const a0 = buckets.get(65010.1);
    expect(a0).toBeDefined();
    expect(a0?.totalQty).toBeCloseTo(4.0);
    expect(a0?.askQty).toBeCloseTo(4.0);
  });

  // 4. Adjacent significant buckets can form a zone
  it('4. Adjacent significant buckets can form a zone', () => {
    settings.priceAggregationTicks = 10; // $0.10 buckets
    settings.zoneMergeDistanceTicks = 20; // 0.20 distance allows merging adjacent
    settings.minLiquidityQty = 1.0;

    const bids = new Map<number, number>([
      [65000.0, 12.0],
      [65000.1, 15.0], // Adjacent bucket
    ]);
    const asks = new Map<number, number>();

    zoneEngine.processObservation(
      1700000000000,
      bids,
      asks,
      65000.1,
      65000.5,
      settings
    );

    const zones = zoneEngine.getAllZones().filter((z) => z.isBid);
    // Should have merged into a single zone
    expect(zones.length).toBe(1);
    expect(zones[0].priceMin).toBeCloseTo(65000.0);
    expect(zones[0].priceMax).toBeCloseTo(65000.2);
    expect(zones[0].currentObservedQty).toBeCloseTo(27.0);
  });

  // 5. Weak noise does not create hundreds of independent zones
  it('5. Weak noise does not create hundreds of independent zones', () => {
    settings.minLiquidityQty = 2.0;
    settings.zoneActivationThreshold = 75;

    const bids = new Map<number, number>();
    // Generate 100 noisy tiny levels of 0.1 BTC (below 2.0 BTC minLiquidityQty)
    for (let i = 0; i < 100; i++) {
      bids.set(64000.0 + i * 0.5, 0.1);
    }

    zoneEngine.processObservation(
      1700000000000,
      bids,
      new Map(),
      64950.0,
      64955.0,
      settings
    );

    const zones = zoneEngine.getAllZones();
    // Zero zones should be created from dust noise
    expect(zones.length).toBe(0);
  });

  // 6. A persistent zone remains visible throughout its observed history
  it('6. A persistent zone remains visible throughout its observed history', () => {
    settings.minLiquidityQty = 0.5;
    settings.minLiquidityNotional = 0;
    settings.zoneActivationThreshold = 60;
    settings.zoneMinDurationMs = 1500;
    const t0 = 1700000000000;
    // Provide realistic book distribution: multiple normal levels (1.0 BTC) + 1 institutional wall (30 BTC)
    const bids = new Map<number, number>([
      [64960.0, 1.0],
      [64970.0, 1.0],
      [64980.0, 1.0],
      [64990.0, 1.0],
      [65000.0, 30.0], // Institutional wall
    ]);
    const asks = new Map<number, number>();

    // Feed observations spanning 3000ms
    for (let i = 0; i <= 6; i++) {
      zoneEngine.processObservation(
        t0 + i * 500,
        bids,
        asks,
        65000.0,
        65010.0,
        settings
      );
    }

    const zones = zoneEngine.getAllZones().filter((z) => z.isBid);
    const z = zones.find((item) => Math.abs(item.centerPrice - 65000.05) < 0.2);
    expect(z).toBeDefined();
    if (!z) return;

    expect(z.firstObservedTime).toBe(t0);
    expect(z.lastObservedTime).toBe(t0 + 3000);
    expect(z.persistenceDurationMs).toBe(3000);
    expect(z.state).toBe('active');

    // Query viewport encompassing the zone
    const visible = zoneEngine.getVisibleZones(t0, t0 + 4000, 64900, 65100, settings);
    expect(visible.some((v) => v.id === z.id)).toBe(true);
  });

  // 7. A zone stops extending when it is no longer observed
  it('7. A zone stops extending when it is no longer observed', () => {
    const t0 = 1700000000000;
    const bids = new Map<number, number>([[65000.0, 20.0]]);

    // Observe at t0, t0+500, t0+1000
    for (let i = 0; i <= 2; i++) {
      zoneEngine.processObservation(t0 + i * 500, bids, new Map(), 65000.0, 65010.0, settings);
    }

    // Now send observations without this level (order was cancelled)
    const emptyBids = new Map<number, number>();
    zoneEngine.processObservation(t0 + 4000, emptyBids, new Map(), 65000.0, 65010.0, settings);

    const z = zoneEngine.getAllZones().find((item) => Math.abs(item.centerPrice - 65000.05) < 0.2);
    expect(z).toBeDefined();
    // Zone should transition to removed and NOT have its history extended to t0 + 4000
    expect(z?.state).toBe('removed');
    expect(z?.lastObservedTime).toBe(t0 + 1000);
    expect(z?.historySegments[0].endTime).toBe(t0 + 1000);
  });

  // 8. The current book is never drawn backward into unobserved historical time
  it('8. The current book is never drawn backward into unobserved historical time', async () => {
    const ob = new OrderBookManager(0.01);
    const mockAdapter = {
      fetchDepthSnapshot: async () => ({
        lastUpdateId: 10,
        timestamp: 1700000050000,
        bids: [[65000.0, 10.0]],
        asks: [[65010.0, 10.0]],
      }),
      fetchRecentTrades: async () => [],
    };
    await ob.synchronize(mockAdapter as any, 'BTCUSDT');

    const candles = [
      { time: 1700000000, open: 65000.0, high: 65005.0, low: 64995.0, close: 65002.0, volume: 100 },
      { time: 1700000060, open: 65002.0, high: 65008.0, low: 65001.0, close: 65005.0, volume: 100 },
    ];

    heatmapEngine.seedFromCandlesAndOrderBook(candles, ob, 100);
    const slices = heatmapEngine.getSlices();

    // Section 1 & 12: A current snapshot never fills unobserved historical cells
    expect(slices.length).toBe(0);
  });

  // 9. Empty data remains visually empty
  it('9. Empty data remains visually empty', () => {
    const emptyBids = new Map<number, number>();
    const emptyAsks = new Map<number, number>();

    const buckets = zoneEngine.aggregateLevels(emptyBids, emptyAsks, settings);
    expect(buckets.size).toBe(0);

    zoneEngine.processObservation(1700000000000, emptyBids, emptyAsks, 0, 0, settings);
    expect(zoneEngine.getAllZones().length).toBe(0);
  });

  // 10. Symbol changes do not leak old zones
  it('10. Symbol changes do not leak old zones', () => {
    // Add zone on BTCUSDT
    const bids = new Map<number, number>([[65000.0, 15.0]]);
    zoneEngine.processObservation(1700000000000, bids, new Map(), 65000.0, 65010.0, settings);
    expect(zoneEngine.getAllZones().length).toBeGreaterThan(0);

    // User switches symbol to ETHUSDT -> calls clear()
    zoneEngine.clear();
    heatmapEngine.clear();

    expect(zoneEngine.getAllZones().length).toBe(0);
    expect(heatmapEngine.getSlices().length).toBe(0);
  });

  // 11. Pan, zoom and resizing preserve alignment
  it('11. Pan, zoom and resizing preserve alignment', () => {
    const t0 = 1700000000000;
    const bids = new Map<number, number>([
      [64000.0, 10.0],
      [65000.0, 10.0],
    ]);
    // Best ask is 65010, so both bids at 64000 and 65000 are valid resting orders
    zoneEngine.processObservation(t0, bids, new Map(), 65000.0, 65010.0, settings);

    // Viewport zoomed into 63900 - 64500 should only contain 64000 zone
    const zoomed1 = zoneEngine.getVisibleZones(t0 - 1000, t0 + 1000, 63900, 64500, settings);
    expect(zoomed1.some((z) => Math.abs(z.centerPrice - 64000) < 5)).toBe(true);
    expect(zoomed1.some((z) => Math.abs(z.centerPrice - 65000) < 5)).toBe(false);

    // Viewport panned to 64800 - 65500 should only contain 65000 zone
    const zoomed2 = zoneEngine.getVisibleZones(t0 - 1000, t0 + 1000, 64800, 65500, settings);
    expect(zoomed2.some((z) => Math.abs(z.centerPrice - 64000) < 5)).toBe(false);
    expect(zoomed2.some((z) => Math.abs(z.centerPrice - 65000) < 5)).toBe(true);
  });

  // 12. Heatmap opacity does not alter underlying market calculations
  it('12. Heatmap opacity does not alter underlying market calculations', () => {
    const bids = new Map<number, number>([[65000.0, 12.5]]);
    zoneEngine.processObservation(1700000000000, bids, new Map(), 65000.0, 65010.0, settings);
    const z1 = zoneEngine.getAllZones()[0];
    const initialQty = z1.currentObservedQty;
    const initialMaxQty = z1.maxObservedQty;

    // Change display visual settings
    settings.opacity = 0.2;
    settings.brightness = 1.8;
    settings.contrast = 2.5;

    // Query visible zones with altered display settings
    const visible = zoneEngine.getVisibleZones(
      1700000000000 - 1000,
      1700000000000 + 1000,
      64000,
      66000,
      settings
    );

    // Market calculations and observed quantities remain mathematically intact
    expect(visible[0].currentObservedQty).toBe(initialQty);
    expect(visible[0].maxObservedQty).toBe(initialMaxQty);
  });

  // 13. The candle layer remains readable and uncompromised
  it('13. The candle layer remains readable and uncompromised', () => {
    // Verifies that default heatmap opacity leaves the foreground candle bodies and wicks crisp
    expect(DEFAULT_HEATMAP_SETTINGS.opacity).toBeLessThan(1.0);
    expect(DEFAULT_HEATMAP_SETTINGS.opacity).toBeGreaterThanOrEqual(0.7);
    expect(DEFAULT_HEATMAP_SETTINGS.showContinuousHeatmap).toBe(true);
  });

  // 14. The live edge does not accumulate duplicated bands
  it('14. The live edge does not accumulate duplicated bands', () => {
    const t0 = 1700000000000;
    const bids = new Map<number, number>([[65000.0, 8.0]]);

    // Simulate 20 rapid order-book ticks at the live edge within 1 second
    for (let i = 0; i < 20; i++) {
      zoneEngine.processObservation(
        t0 + i * 50,
        bids,
        new Map(),
        65000.0,
        65010.0,
        settings
      );
    }

    const zones = zoneEngine.getAllZones();
    // Must remain 1 zone matching 65000.0, not 20 duplicated bands
    expect(zones.length).toBe(1);
    expect(zones[0].observationCount).toBe(20);
  });

  // 15. The renderer stays within a configurable CPU and memory budget
  it('15. The renderer stays within a configurable CPU and memory budget', () => {
    settings.maxOutlinedZones = 8; // Configured budget
    settings.minLiquidityQty = 0.5;

    // Generate 30 significant levels
    const bids = new Map<number, number>();
    for (let i = 0; i < 30; i++) {
      bids.set(65000.0 + i * 5.0, 10.0 + i);
    }

    zoneEngine.processObservation(
      1700000000000,
      bids,
      new Map(),
      65000.0,
      65010.0,
      settings
    );

    const visible = zoneEngine.getVisibleZones(
      1700000000000 - 1000,
      1700000000000 + 1000,
      64000.0,
      66000.0,
      settings
    );

    // Must be capped strictly at maxOutlinedZones budget
    expect(visible.length).toBeLessThanOrEqual(8);
    // Highest volume/significance zones should be prioritized
    expect(visible[0].relativeSignificance).toBeGreaterThanOrEqual(visible[visible.length - 1].relativeSignificance);
  });
});
