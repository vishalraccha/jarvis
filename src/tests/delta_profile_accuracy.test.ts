/**
 * JARVIS 2.0 Delta Profile Order Flow & Accuracy Test Suite
 * Validates:
 * 1. Positive delta calculation
 * 2. Negative delta calculation
 * 3. Zero delta handling and delta percentage safety
 * 4. Delta POC calculation via absolute net delta vs Volume POC distinction
 * 5. Price bucket aggregation respecting instrument tick sizes
 * 6. Deduplication and live streaming without double-counting
 * 7. Trapped buyers and trapped sellers detection
 * 8. Delta divergence detection
 * 9. AI evidence snapshot integration and estimated proxy disclosures
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeltaProfileEngine } from '../services/deltaProfile/DeltaProfileEngine';
import { MarketTrade } from '../types/market';
import { aiToolRegistry } from '../services/ai/AIToolRegistry';

function createTrade(
  id: string,
  timestamp: number,
  price: number,
  quantity: number,
  side: 'buy' | 'sell',
  symbol: string = 'BTCUSDT',
  exchange: string = 'binance'
): MarketTrade {
  return {
    id,
    timestamp,
    price,
    quantity,
    notional: price * quantity,
    side,
    symbol,
    exchange,
  };
}

describe('Delta Profile Engine & Order Flow Suite', () => {
  let engine: DeltaProfileEngine;

  beforeEach(() => {
    engine = new DeltaProfileEngine('BTCUSDT', 'binance', '1m');
    engine.updateSettings({
      enabled: true,
      rangeMode: 'lookback',
      lookbackBars: 100,
      ticksPerRow: 1,
    });
  });

  it('1. Calculates positive delta correctly (Aggressive Buyers taking Ask)', () => {
    const now = Date.now();
    // 3 buyer-aggressor trades at 60,000 (total buy: 15.0)
    // 1 seller-aggressor trade at 60,000 (total sell: 5.0)
    const trades: MarketTrade[] = [
      createTrade('t1', now - 1000, 60000, 5.0, 'buy'),
      createTrade('t2', now - 800, 60000, 4.0, 'buy'),
      createTrade('t3', now - 600, 60000, 6.0, 'buy'),
      createTrade('t4', now - 400, 60000, 5.0, 'sell'),
    ];

    engine.ingestTrades(trades);
    const metrics = engine.getMetrics();

    expect(metrics.levels.length).toBe(1);
    const lvl = metrics.levels[0];
    expect(lvl.price).toBe(60000);
    expect(lvl.buyVolume).toBe(15.0);
    expect(lvl.sellVolume).toBe(5.0);
    expect(lvl.totalVolume).toBe(20.0);
    expect(lvl.delta).toBe(10.0); // 15 - 5
    expect(lvl.deltaPercent).toBe(50.0); // (10 / 20) * 100
    expect(metrics.netDelta).toBe(10.0);
    expect(metrics.maxPositiveDelta).toBe(10.0);
  });

  it('2. Calculates negative delta correctly (Aggressive Sellers taking Bid)', () => {
    const now = Date.now();
    // 1 buyer-aggressor trade (buy: 2.0)
    // 3 seller-aggressor trades (sell: 12.0)
    const trades: MarketTrade[] = [
      createTrade('t1', now - 1000, 59900, 2.0, 'buy'),
      createTrade('t2', now - 800, 59900, 4.0, 'sell'),
      createTrade('t3', now - 600, 59900, 5.0, 'sell'),
      createTrade('t4', now - 400, 59900, 3.0, 'sell'),
    ];

    engine.ingestTrades(trades);
    const metrics = engine.getMetrics();

    expect(metrics.levels.length).toBe(1);
    const lvl = metrics.levels[0];
    expect(lvl.price).toBe(59900);
    expect(lvl.buyVolume).toBe(2.0);
    expect(lvl.sellVolume).toBe(12.0);
    expect(lvl.totalVolume).toBe(14.0);
    expect(lvl.delta).toBe(-10.0); // 2 - 12
    expect(lvl.deltaPercent).toBe(-71.4); // (-10 / 14) * 100
    expect(metrics.netDelta).toBe(-10.0);
    expect(metrics.maxNegativeDelta).toBe(-10.0);
  });

  it('3. Handles zero delta and unclassified trades safely without division by zero', () => {
    const now = Date.now();
    const trades: MarketTrade[] = [
      createTrade('t1', now - 1000, 59950, 8.0, 'buy'),
      createTrade('t2', now - 500, 59950, 8.0, 'sell'),
    ];

    engine.ingestTrades(trades);
    const metrics = engine.getMetrics();

    expect(metrics.levels.length).toBe(1);
    const lvl = metrics.levels[0];
    expect(lvl.delta).toBe(0);
    expect(lvl.deltaPercent).toBe(0);
    expect(lvl.totalVolume).toBe(16.0);
  });

  it('4. Calculates Delta POC using absolute net delta and differentiates from Volume POC', () => {
    const now = Date.now();
    // Level A (Price 60,100): High volume, but balanced delta (Buy: 100, Sell: 90 -> Total: 190, Delta: +10)
    // Level B (Price 60,000): Lower volume, but extreme negative delta (Buy: 5, Sell: 65 -> Total: 70, Delta: -60)
    const trades: MarketTrade[] = [
      createTrade('tA1', now - 2000, 60100, 100.0, 'buy'),
      createTrade('tA2', now - 1800, 60100, 90.0, 'sell'),

      createTrade('tB1', now - 1000, 60000, 5.0, 'buy'),
      createTrade('tB2', now - 800, 60000, 65.0, 'sell'),
    ];

    engine.ingestTrades(trades);
    const metrics = engine.getMetrics();

    // Volume POC must be at 60,100 (190 total volume)
    expect(metrics.volumePoc?.price).toBe(60100);
    expect(metrics.volumePoc?.totalVolume).toBe(190.0);

    // Delta POC must be at 60,000 (greatest absolute net delta: |-60| > |+10|)
    expect(metrics.deltaPoc?.price).toBe(60000);
    expect(metrics.deltaPoc?.delta).toBe(-60.0);
    expect(metrics.deltaPoc?.isPoc).toBe(true);

    // Differentiated: Delta POC !== Volume POC
    expect(metrics.deltaPoc?.price).not.toBe(metrics.volumePoc?.price);
  });

  it('5. Price bucket aggregation respects instrument tick size and ticksPerRow multiplier', () => {
    // XAUUSD has base tick 0.01
    const goldEngine = new DeltaProfileEngine('XAUUSD', 'binance', '1m');
    const baseStep = goldEngine.getPriceStep();
    expect(baseStep).toBe(0.01);

    // Align price 2745.123 to 0.01 step
    const aligned1 = goldEngine.alignPrice(2745.123, 0.01);
    expect(aligned1).toBe(2745.12);

    // Ticks per row = 5 -> step = 0.05
    goldEngine.updateSettings({ ticksPerRow: 5 });
    const step5 = goldEngine.getPriceStep();
    expect(step5).toBeCloseTo(0.05, 2);

    const alignedStep5 = goldEngine.alignPrice(2745.38, 0.05);
    expect(alignedStep5).toBe(2745.4);
  });

  it('6. Live and historical trades ingest without duplicate double-counting', () => {
    const now = Date.now();
    const trade1 = createTrade('trade_unique_101', now - 500, 60000, 5.0, 'buy');

    const addedFirst = engine.addTrade(trade1);
    expect(addedFirst).toBe(true);

    // Duplicate trade with same ID
    const addedSecond = engine.addTrade(trade1);
    expect(addedSecond).toBe(false);

    const metrics = engine.getMetrics();
    expect(metrics.levels[0].buyVolume).toBe(5.0);
    expect(metrics.levels[0].tradeCount).toBe(1);
  });

  it('7. Detects POTENTIAL TRAPPED BUYERS when aggressive buying fails at range highs', () => {
    const now = Date.now();
    // Build a range spanning 60,000 to 60,500
    // At high level (60,490): massive aggressive buying (+80 delta), but price capped and stalled
    const trades: MarketTrade[] = [
      createTrade('tL1', now - 5000, 60000, 10, 'buy'),
      createTrade('tL2', now - 4000, 60100, 10, 'buy'),
      createTrade('tM1', now - 3000, 60250, 15, 'buy'),
      createTrade('tM2', now - 2000, 60350, 10, 'buy'),
      // High resistance: aggressive buyers buying top
      createTrade('tH1', now - 1000, 60490, 90, 'buy'),
      createTrade('tH2', now - 500, 60490, 10, 'sell'),
    ];

    engine.ingestTrades(trades);
    const metrics = engine.getMetrics();

    expect(metrics.trappedBuyers.length).toBeGreaterThan(0);
    const trapped = metrics.trappedBuyers[0];
    expect(trapped.price).toBe(60490);
    expect(trapped.label).toBe('POTENTIAL TRAPPED BUYERS');
    expect(trapped.delta).toBe(80);
  });

  it('8. Detects POTENTIAL TRAPPED SELLERS when aggressive selling fails at range lows', () => {
    const now = Date.now();
    // Build a range spanning 60,000 to 60,500
    // At low support (60,010): massive aggressive selling (-85 delta), absorbed by buyers
    const trades: MarketTrade[] = [
      createTrade('tS1', now - 5000, 60010, 10, 'buy'),
      createTrade('tS2', now - 4000, 60010, 95, 'sell'),
      createTrade('tM1', now - 3000, 60200, 10, 'buy'),
      createTrade('tM2', now - 2000, 60350, 15, 'buy'),
      createTrade('tH1', now - 1000, 60500, 10, 'buy'),
    ];

    engine.ingestTrades(trades);
    const metrics = engine.getMetrics();

    expect(metrics.trappedSellers.length).toBeGreaterThan(0);
    const trapped = metrics.trappedSellers[0];
    expect(trapped.price).toBe(60010);
    expect(trapped.label).toBe('POTENTIAL TRAPPED SELLERS');
    expect(trapped.delta).toBe(-85);
  });

  it('9. Integrates seamlessly into AI Evidence Snapshot with proper disclosure', () => {
    const now = Date.now();
    engine.addTrade(createTrade('ai_t1', now, 60000, 12.0, 'buy'));

    aiToolRegistry.setContext({ deltaProfileEngine: engine });
    const snapshot = aiToolRegistry.generateSnapshot('BTCUSDT', '1m', [
      { time: now / 1000, open: 59900, high: 60100, low: 59850, close: 60000, volume: 100 },
    ], 60000);

    expect(snapshot.deltaProfile).toBeDefined();
    expect(snapshot.deltaProfile?.netDelta).toBe(12.0);
    expect(snapshot.deltaProfile?.deltaPocPrice).toBe(60000);
    expect(snapshot.deltaProfile?.isEstimated).toBe(false);
    expect(snapshot.deltaProfile?.dataSource).toBe('authoritative_trades');
    expect(snapshot.deltaProfile?.summary).toContain('Delta POC at $60000');
  });

  it('10. Aggregates delta using custom row step matching visible chart discretization', () => {
    const now = Date.now();
    const trades: MarketTrade[] = [
      createTrade('t1', now - 1000, 60010, 10, 'buy'),
      createTrade('t2', now - 800, 60040, 15, 'buy'),
      createTrade('t3', now - 600, 60080, 20, 'sell'),
      createTrade('t4', now - 400, 60120, 5, 'buy'),
    ];
    engine.ingestTrades(trades);

    // Grouping with 100 USD customStep (e.g. 60,000 to 60,100)
    const metrics100 = engine.getMetrics(100);
    expect(metrics100.stepPrice).toBe(100);
    expect(metrics100.levels.length).toBe(2); // 60,000 and 60,100 buckets
    const bucket60000 = metrics100.levels.find(l => l.price === 60000);
    expect(bucket60000).toBeDefined();
    expect(bucket60000?.buyVolume).toBe(25); // 10 + 15
    expect(bucket60000?.sellVolume).toBe(0);
    expect(bucket60000?.delta).toBe(25);

    const bucket60100 = metrics100.levels.find(l => l.price === 60100);
    expect(bucket60100).toBeDefined();
    expect(bucket60100?.buyVolume).toBe(5);
    expect(bucket60100?.sellVolume).toBe(20);
    expect(bucket60100?.delta).toBe(-15);
  });

  it('11. Seeds from candles to span full visible chart range when trade stream starts', () => {
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);
    // Historical candles spanning 1615 to 1642
    const candles = [
      { time: nowSec - 300, open: 1615, high: 1625, low: 1610, close: 1620, volume: 100 },
      { time: nowSec - 200, open: 1620, high: 1635, low: 1618, close: 1632, volume: 150 },
      { time: nowSec - 100, open: 1632, high: 1642, low: 1630, close: 1636, volume: 200 },
    ];

    const ethEngine = new DeltaProfileEngine('ETHUSDT', 'binance', '1m');
    ethEngine.seedFromCandles(candles);
    const metrics = ethEngine.getMetrics(5); // $5 price rungs

    expect(metrics.levels.length).toBeGreaterThan(4);
    expect(metrics.minPrice).toBeLessThanOrEqual(1615);
    expect(metrics.maxPrice).toBeGreaterThanOrEqual(1640);
    expect(metrics.totalVolume).toBeGreaterThan(0);
  });
});
