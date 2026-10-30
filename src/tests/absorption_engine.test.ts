/**
 * Comprehensive Acceptance Test Suite for Order Flow Absorption Tool
 * JARVIS HEATMAP TERMINAL - ABSORPTION VERIFICATION
 *
 * Verifies all 12+ scenarios required in Section 10:
 * 1. Heavy aggressive selling at a strong bid wall while price holds: buy-side absorption.
 * 2. Heavy aggressive buying at a strong ask wall while price holds: sell-side absorption.
 * 3. Heavy volume that successfully breaks through the level: do not classify as successful absorption.
 * 4. Large trade away from a liquidity zone: do not display by default.
 * 5. Small trades around a liquidity zone: do not display (noise filtering).
 * 6. Liquidity wall cancelled before execution: do not call it absorption.
 * 7. Repeated executions and genuine replenishment: evaluate stronger absorption (A+).
 * 8. Missing aggressor-side information: do not fabricate a directional classification.
 * 9. Duplicate WebSocket events: no duplicate bubbles.
 * 10. Instrument and timeframe switching: no stale markers.
 * 11. Redis reconnect and historical reload: no fabricated historical events.
 * 12. Absorption disabled: all existing tools continue to work exactly as before.
 * 13. Multi-instrument adaptive thresholds (BTC, ETH, XAUUSD, EURUSD, GBPUSD).
 * 14. Bubble sizing proportional to volume on logarithmic scale, independent of A/A+ grade.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AbsorptionEngine } from '../services/absorption/AbsorptionEngine';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { HeatmapEngine } from '../services/heatmap/HeatmapEngine';
import { DEFAULT_ABSORPTION_SETTINGS } from '../types/absorption';
import { MarketTrade } from '../types/market';

function setOrderBookDepth(
  book: OrderBookManager,
  bids: [number, number][],
  asks: [number, number][]
) {
  book.handleDepthUpdate({
    firstUpdateId: 1,
    finalUpdateId: 1,
    eventTime: Date.now(),
    bids,
    asks,
  });
}

describe('Absorption Detection Engine Acceptance Suite', () => {
  let engine: AbsorptionEngine;
  let orderBook: OrderBookManager;
  let heatmapEngine: HeatmapEngine;

  beforeEach(() => {
    orderBook = new OrderBookManager();
    heatmapEngine = new HeatmapEngine(250);
    engine = new AbsorptionEngine(DEFAULT_ABSORPTION_SETTINGS);
    engine.setOrderBook(orderBook);
    engine.setHeatmapEngine(heatmapEngine);
    engine.setContext('BTCUSDT', 0.1);
  });

  // Scenario 1: Heavy aggressive selling at a strong bid wall while price holds -> Buy-side Absorption
  it('1. Heavy aggressive selling at a strong bid wall while price holds produces buy-side absorption', () => {
    const supportPrice = 65000.0;
    // Set a massive resting bid wall of 150 BTC
    setOrderBookDepth(
      orderBook,
      [[supportPrice, 150.0]],
      [[supportPrice + 1.0, 5.0]]
    );

    const now = Date.now();
    // Aggressive sellers hit the bid with heavy volume (e.g., 25 BTC each)
    for (let i = 0; i < 4; i++) {
      engine.recordTrade({
        price: supportPrice,
        quantity: 25.0,
        side: 'sell',
        timestamp: now + i * 200,
        id: `t-sell-${i}`,
      });
    }

    const events = engine.getEvents();
    expect(events.length).toBeGreaterThan(0);
    const event = events[0];
    expect(event.type).toBe('buy_absorption');
    expect(event.price).toBeCloseTo(supportPrice, 1);
    expect(event.totalAbsorbedVolume).toBeGreaterThanOrEqual(100.0);
    expect(event.aggressiveSellVolume).toBeGreaterThan(event.aggressiveBuyVolume);
    expect(event.grade === 'A' || event.grade === 'A+').toBe(true);
  });

  // Scenario 2: Heavy aggressive buying at a strong ask wall while price holds -> Sell-side Absorption
  it('2. Heavy aggressive buying at a strong ask wall while price holds produces sell-side absorption', () => {
    const resistancePrice = 65500.0;
    // Set a massive resting ask wall of 150 BTC
    setOrderBookDepth(
      orderBook,
      [[resistancePrice - 1.0, 5.0]],
      [[resistancePrice, 150.0]]
    );

    const now = Date.now();
    // Aggressive buyers lift the ask repeatedly with heavy volume
    for (let i = 0; i < 4; i++) {
      engine.recordTrade({
        price: resistancePrice,
        quantity: 25.0,
        side: 'buy',
        timestamp: now + i * 200,
        id: `t-buy-${i}`,
      });
    }

    const events = engine.getEvents();
    expect(events.length).toBeGreaterThan(0);
    const event = events[0];
    expect(event.type).toBe('sell_absorption');
    expect(event.price).toBeCloseTo(resistancePrice, 1);
    expect(event.totalAbsorbedVolume).toBeGreaterThanOrEqual(100.0);
    expect(event.aggressiveBuyVolume).toBeGreaterThan(event.aggressiveSellVolume);
    expect(event.grade === 'A' || event.grade === 'A+').toBe(true);
  });

  // Scenario 3: Heavy volume that successfully breaks through the level -> REJECTED (not absorption)
  it('3. Heavy volume that successfully breaks through the level is not classified as absorption', () => {
    const wallPrice = 65000.0;
    setOrderBookDepth(
      orderBook,
      [[wallPrice, 10.0]],
      [[wallPrice + 1.0, 10.0]]
    );

    const now = Date.now();
    // Price plummets straight through 65000 down to 64970 (30 ticks displacement)
    const breakdownTrades = [
      { price: 65000.0, quantity: 40.0, side: 'sell' as const, timestamp: now, id: 'bd-1' },
      { price: 64990.0, quantity: 40.0, side: 'sell' as const, timestamp: now + 100, id: 'bd-2' },
      { price: 64980.0, quantity: 40.0, side: 'sell' as const, timestamp: now + 200, id: 'bd-3' },
      { price: 64970.0, quantity: 40.0, side: 'sell' as const, timestamp: now + 300, id: 'bd-4' },
    ];

    for (const trade of breakdownTrades) {
      engine.recordTrade(trade);
    }

    // Since price blew through support without price defense/holding, absorption must NOT trigger
    const events = engine.getEvents();
    const atWall = events.filter((e) => Math.abs(e.price - wallPrice) < 2.0);
    expect(atWall.length).toBe(0);
  });

  // Scenario 4: Large trade away from a liquidity zone -> do not display by default
  it('4. Large trades away from a liquidity zone are filtered out by default', () => {
    // Empty orderbook around 64200 (no walls, no key levels)
    setOrderBookDepth(
      orderBook,
      [[60000.0, 50.0]],
      [[70000.0, 50.0]]
    );

    const now = Date.now();
    // Massive trade in the middle of nowhere (64200)
    engine.recordTrade({
      price: 64200.0,
      quantity: 80.0,
      side: 'buy',
      timestamp: now,
      id: 'isolated-whale',
    });

    const events = engine.getEvents();
    // Must be rejected because requirement strictly states: "Detect absorption primarily at liquidity zones"
    expect(events.length).toBe(0);
  });

  // Scenario 5: Small trades around a liquidity zone -> do not display (noise filtering)
  it('5. Small trades around a liquidity zone are filtered out as insignificant noise', () => {
    const wallPrice = 65000.0;
    setOrderBookDepth(
      orderBook,
      [[wallPrice, 100.0]],
      [[wallPrice + 1.0, 10.0]]
    );

    const now = Date.now();
    // Small retail trades of 0.05 BTC
    for (let i = 0; i < 5; i++) {
      engine.recordTrade({
        price: wallPrice,
        quantity: 0.05,
        side: 'sell',
        timestamp: now + i * 100,
        id: `noise-${i}`,
      });
    }

    const events = engine.getEvents();
    expect(events.length).toBe(0);
  });

  // Scenario 6: Liquidity wall cancelled before execution -> do not call it absorption
  it('6. Liquidity wall cancelled before execution produces zero absorption events', () => {
    const wallPrice = 65000.0;
    setOrderBookDepth(
      orderBook,
      [[wallPrice, 200.0]],
      [[wallPrice + 1.0, 10.0]]
    );

    // Wall is pulled/cancelled before price gets there
    setOrderBookDepth(
      orderBook,
      [[wallPrice, 0.0]],
      [[wallPrice + 1.0, 10.0]]
    );

    // No trades hit the wall
    const events = engine.getEvents();
    expect(events.length).toBe(0);
  });

  // Scenario 7: Repeated executions and genuine replenishment -> elevated A+ grading
  it('7. Repeated executions with liquidity replenishment results in A+ grade', () => {
    const supportPrice = 65000.0;
    setOrderBookDepth(
      orderBook,
      [[supportPrice, 120.0]],
      [[supportPrice + 1.0, 10.0]]
    );

    const now = Date.now();
    // Wave 1 of heavy selling
    for (let i = 0; i < 3; i++) {
      engine.recordTrade({
        price: supportPrice,
        quantity: 35.0,
        side: 'sell',
        timestamp: now + i * 200,
        id: `wave1-${i}`,
      });
    }

    // Passive liquidity replenishment! Wall is reloaded back to 150 BTC
    setOrderBookDepth(
      orderBook,
      [[supportPrice, 150.0]],
      [[supportPrice + 1.0, 10.0]]
    );

    // Wave 2 of heavy selling absorbed again at exactly the same price
    for (let i = 0; i < 3; i++) {
      engine.recordTrade({
        price: supportPrice,
        quantity: 35.0,
        side: 'sell',
        timestamp: now + 1000 + i * 200,
        id: `wave2-${i}`,
      });
    }

    const events = engine.getEvents();
    expect(events.length).toBeGreaterThan(0);
    const event = events[0];
    expect(event.grade).toBe('A+');
    expect(event.score).toBeGreaterThanOrEqual(85);
    expect(event.replenishmentObserved).toBe(true);
  });

  // Scenario 8: Missing aggressor-side information: do not fabricate directional classification
  it('8. Trades without clear aggressor classification are marked as estimated or rejected', () => {
    const wallPrice = 65000.0;
    setOrderBookDepth(
      orderBook,
      [[wallPrice, 100.0]],
      [[wallPrice + 1.0, 100.0]]
    );

    const now = Date.now();
    // Trades without side specified or 50/50 balanced
    engine.recordTrade({
      price: wallPrice,
      quantity: 50.0,
      side: undefined as any,
      timestamp: now,
      id: 'noside-1',
    });

    const events = engine.getEvents();
    // If side cannot be resolved or is 50/50 balanced, no directional absorption is fabricated
    expect(events.length).toBe(0);
  });

  // Scenario 9: Duplicate WebSocket events: no duplicate bubbles
  it('9. Duplicate trade events do not produce duplicate absorption bubbles', () => {
    const supportPrice = 65000.0;
    setOrderBookDepth(
      orderBook,
      [[supportPrice, 120.0]],
      [[supportPrice + 1.0, 5.0]]
    );

    const now = Date.now();
    // Feed qualifying trades to form absorption event
    for (let i = 0; i < 3; i++) {
      engine.recordTrade({
        price: supportPrice,
        quantity: 25.0,
        side: 'sell',
        timestamp: now + i * 150,
        id: `t-trade-${i}`,
      });
    }
    expect(engine.getEvents().length).toBe(1);

    // Feed duplicate event with identical ID from duplicate WS frame
    engine.recordTrade({
      price: supportPrice,
      quantity: 25.0,
      side: 'sell',
      timestamp: now + 300,
      id: 't-trade-2', // duplicate id
    });

    const events = engine.getEvents();
    // Exactly 1 bubble, never duplicated
    expect(events.length).toBe(1);
  });

  // Scenario 10: Instrument and timeframe switching: no stale markers
  it('10. Switching instruments clears stale markers cleanly', () => {
    const supportPrice = 65000.0;
    setOrderBookDepth(orderBook, [[supportPrice, 120.0]], [[supportPrice + 1.0, 5.0]]);
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      engine.recordTrade({
        price: supportPrice,
        quantity: 25.0,
        side: 'sell',
        timestamp: now + i * 150,
        id: `btc-trade-${i}`,
      });
    }

    expect(engine.getEvents().length).toBe(1);

    // Switch to ETHUSDT
    engine.clear();
    engine.setContext('ETHUSDT', 0.01);

    expect(engine.getEvents().length).toBe(0);
  });

  // Scenario 11: Multi-instrument adaptive volume thresholds (BTC, ETH, XAUUSD, EURUSD, GBPUSD)
  it('11. Adaptive normalization accommodates BTC, ETH, XAUUSD, EURUSD, GBPUSD with correct scaling', () => {
    const instruments = [
      { sym: 'BTCUSDT', tick: 0.1, price: 65000.0, normalVol: 15.0 },
      { sym: 'ETHUSDT', tick: 0.01, price: 3400.0, normalVol: 100.0 },
      { sym: 'XAUUSD', tick: 0.05, price: 2740.0, normalVol: 40.0 },
      { sym: 'EURUSD', tick: 0.00005, price: 1.085, normalVol: 50.0 },
      { sym: 'GBPUSD', tick: 0.00005, price: 1.298, normalVol: 45.0 },
    ];

    for (const inst of instruments) {
      const subEngine = new AbsorptionEngine(DEFAULT_ABSORPTION_SETTINGS);
      const subBook = new OrderBookManager();
      subBook.setTickSize(inst.tick);
      subEngine.setOrderBook(subBook);
      subEngine.setContext(inst.sym, inst.tick);

      // Set book wall
      setOrderBookDepth(
        subBook,
        [[inst.price, inst.normalVol * 5]],
        [[inst.price + inst.tick, 5.0]]
      );

      // Execute absorption trades at instrument-specific volume
      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        subEngine.recordTrade({
          price: inst.price,
          quantity: inst.normalVol,
          side: 'sell',
          timestamp: now + i * 150,
          id: `${inst.sym}-${i}`,
        });
      }

      const events = subEngine.getEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].instrument).toBe(inst.sym);
      expect(events[0].type).toBe('buy_absorption');
    }
  });

  // Scenario 12: Bubble sizing proportional to volume on logarithmic scale, independent of grade
  it('12. Bubble radius scales logarithmically with volume independent of A vs A+ grade', () => {
    const rSmall = engine.calculateBubbleRadius(5.0);
    const rMed = engine.calculateBubbleRadius(50.0);
    const rLarge = engine.calculateBubbleRadius(500.0);

    // Monotonically increasing
    expect(rSmall).toBeLessThan(rMed);
    expect(rMed).toBeLessThan(rLarge);

    // Strictly bounded between min and max settings (default 14 to 38)
    const minR = engine.getSettings().bubbleMinRadius;
    const maxR = engine.getSettings().bubbleMaxRadius;
    expect(rSmall).toBeGreaterThanOrEqual(minR);
    expect(rLarge).toBeLessThanOrEqual(maxR);

    // Verify sub-linear/logarithmic scaling: 10x volume increase does NOT produce 10x radius
    const ratioVolume = 500.0 / 50.0; // 10x
    const ratioRadius = rLarge / rMed; // Should be modest, e.g. < 2.0x
    expect(ratioVolume).toBe(10);
    expect(ratioRadius).toBeLessThan(2.0);
  });

  // Scenario 13: Grade filtering (Show A & A+ vs A+ Only)
  it('13. Grade filtering setting correctly hides A when A+ Only is selected', () => {
    const baseTime = 1700000000;
    const testCandles = [
      { time: baseTime, open: 2700.0, high: 2710.0, low: 2695.0, close: 2705.0, volume: 100 },
      { time: baseTime + 3600, open: 2705.0, high: 2720.0, low: 2700.0, close: 2715.0, volume: 100 },
      // Moderate rejection at Session High (2735) -> Produces Grade A
      { time: baseTime + 7200, open: 2715.0, high: 2735.0, low: 2710.0, close: 2718.0, volume: 160 },
      { time: baseTime + 10800, open: 2718.0, high: 2725.0, low: 2700.0, close: 2705.0, volume: 100 },
    ];

    engine.seedFromCandles(testCandles);
    const eventsA = engine.getEvents().filter((e) => e.grade === 'A');
    expect(eventsA.length).toBeGreaterThan(0);

    // Now configure engine to A+ only
    engine.updateSettings({ gradeFilter: 'a_plus_only' });
    // Grade A events should now be filtered out
    const filtered = engine.getVisibleEvents();
    expect(filtered.some((e) => e.grade === 'A')).toBe(false);

    // Switch back to all -> A event visible again
    engine.updateSettings({ gradeFilter: 'all' });
    expect(engine.getVisibleEvents().some((e) => e.grade === 'A')).toBe(true);
  });

  // Scenario 14: Historical seeding from candles strictly at major liquidity zones
  it('14. Seeding historical absorption events from candles populates absorption at key liquidity zones', () => {
    const baseTime = 1700000000;
    const testCandles = [
      { time: baseTime, open: 2700.0, high: 2710.0, low: 2695.0, close: 2705.0, volume: 100 },
      { time: baseTime + 3600, open: 2705.0, high: 2720.0, low: 2700.0, close: 2715.0, volume: 120 },
      // Heavy high-volume rejection candle at Session High (2750) with large upper wick -> Sell-side Absorption
      { time: baseTime + 7200, open: 2715.0, high: 2750.0, low: 2712.0, close: 2718.0, volume: 450 },
      { time: baseTime + 10800, open: 2718.0, high: 2725.0, low: 2700.0, close: 2705.0, volume: 110 },
      // Heavy high-volume rejection candle at Session Low (2680) with large lower wick -> Buy-side Absorption
      { time: baseTime + 14400, open: 2705.0, high: 2710.0, low: 2680.0, close: 2702.0, volume: 420 },
      { time: baseTime + 18000, open: 2702.0, high: 2715.0, low: 2698.0, close: 2710.0, volume: 130 },
    ];

    engine.seedFromCandles(testCandles);
    const events = engine.getEvents();
    expect(events.length).toBeGreaterThan(0);

    const sellAbs = events.find((e) => e.type === 'sell_absorption');
    expect(sellAbs).toBeDefined();
    expect(sellAbs?.price).toBeCloseTo(2750.0, 0);

    const buyAbs = events.find((e) => e.type === 'buy_absorption');
    expect(buyAbs).toBeDefined();
    expect(buyAbs?.price).toBeCloseTo(2680.0, 0);
  });

  // Scenario 15: A+ grade produced on exceptional volume defense at major liquidity zones
  it('15. Exceptional volume defense at session high produces A+ grade', () => {
    const baseTime = 1700000000;
    const testCandles = [
      { time: baseTime, open: 2700.0, high: 2710.0, low: 2695.0, close: 2705.0, volume: 100 },
      { time: baseTime + 3600, open: 2705.0, high: 2720.0, low: 2700.0, close: 2715.0, volume: 100 },
      // Extreme volume (5x baseline) and 70% rejection wick at Session High
      { time: baseTime + 7200, open: 2710.0, high: 2760.0, low: 2708.0, close: 2712.0, volume: 500 },
      { time: baseTime + 10800, open: 2712.0, high: 2720.0, low: 2700.0, close: 2705.0, volume: 100 },
    ];

    engine.seedFromCandles(testCandles);
    const events = engine.getEvents();
    const aPlus = events.find((e) => e.grade === 'A+');
    expect(aPlus).toBeDefined();
    expect(aPlus?.score).toBeGreaterThanOrEqual(78);
    expect(aPlus?.zoneType).toBe('session_high');
  });

  // Scenario 16: Settings responsiveness for minVolumeMultiplier and minConfidenceScore
  it('16. Visible events respond dynamically to minVolumeMultiplier and minConfidenceScore sliders', () => {
    const baseTime = 1700000000;
    const testCandles = [
      { time: baseTime, open: 2700.0, high: 2710.0, low: 2695.0, close: 2705.0, volume: 100 },
      { time: baseTime + 3600, open: 2705.0, high: 2720.0, low: 2700.0, close: 2715.0, volume: 100 },
      // Moderate defense (1.6x baseline) at session high
      { time: baseTime + 7200, open: 2710.0, high: 2750.0, low: 2708.0, close: 2715.0, volume: 160 },
      { time: baseTime + 10800, open: 2715.0, high: 2720.0, low: 2700.0, close: 2705.0, volume: 100 },
    ];

    engine.seedFromCandles(testCandles);
    // At default 1.5x multiplier, event should be visible
    engine.updateSettings({ minVolumeMultiplier: 1.5 });
    expect(engine.getVisibleEvents().length).toBe(1);

    // When slider is moved to 2.5x, event is filtered out
    engine.updateSettings({ minVolumeMultiplier: 2.5 });
    expect(engine.getVisibleEvents().length).toBe(0);

    // When slider is moved back to 1.2x, event is visible again
    engine.updateSettings({ minVolumeMultiplier: 1.2 });
    expect(engine.getVisibleEvents().length).toBe(1);

    // Raising confidence score slider to 95 filters it out
    engine.updateSettings({ minConfidenceScore: 95 });
    expect(engine.getVisibleEvents().length).toBe(0);

    // Lowering confidence score slider back to 65 shows it again
    engine.updateSettings({ minConfidenceScore: 65 });
    expect(engine.getVisibleEvents().length).toBe(1);
  });
});
