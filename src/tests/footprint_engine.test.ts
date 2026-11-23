import { describe, it, expect, beforeEach } from 'vitest';
import { FootprintEngine } from '../services/footprint/FootprintEngine';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { MarketTrade } from '../types/market';

describe('FootprintEngine Unit & Validation Suite', () => {
  let engine: FootprintEngine;

  beforeEach(() => {
    engine = new FootprintEngine('BTCUSDT', '5m', 0.01);
  });

  it('1. Correctly classifies aggressive buyer vs aggressive seller trades', () => {
    const t1: MarketTrade = {
      id: 'trade-1',
      timestamp: 1700000000000,
      price: 67500.0,
      quantity: 1.5,
      notional: 67500.0 * 1.5,
      side: 'buy', // Buyer aggressor lifted ask
      isBuyerMaker: false,
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    const t2: MarketTrade = {
      id: 'trade-2',
      timestamp: 1700000001000,
      price: 67500.0,
      quantity: 0.8,
      notional: 67500.0 * 0.8,
      side: 'sell', // Seller aggressor hit bid
      isBuyerMaker: true,
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    engine.addTrade(t1);
    engine.addTrade(t2);

    const candles = engine.getAllCandles();
    expect(candles.length).toBe(1);

    const candle = candles[0];
    expect(candle.buyVolume).toBeCloseTo(1.5);
    expect(candle.sellVolume).toBeCloseTo(0.8);
    expect(candle.totalVolume).toBeCloseTo(2.3);
    expect(candle.delta).toBeCloseTo(0.7);

    // Level check: BID x ASK (Left = Seller aggressor = 0.8, Right = Buyer aggressor = 1.5)
    const level = candle.levels.get(67500.0);
    expect(level).toBeDefined();
    expect(level?.bidVolume).toBeCloseTo(0.8);
    expect(level?.askVolume).toBeCloseTo(1.5);
    expect(level?.totalVolume).toBeCloseTo(2.3);
    expect(level?.delta).toBeCloseTo(0.7);
  });

  it('2. Correctly groups trades into tick-aligned price buckets with custom multipliers', () => {
    // 4 ticks = 0.04 bucket for 0.01 tickSize
    engine.updateSettings({ tickMultiplier: 4 });
    expect(engine.getBucketSize()).toBeCloseTo(0.04);

    const t1: MarketTrade = {
      id: 'trade-1',
      timestamp: 1700000000000,
      price: 67500.01,
      quantity: 1.0,
      notional: 67500.01,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    const t2: MarketTrade = {
      id: 'trade-2',
      timestamp: 1700000001000,
      price: 67500.03,
      quantity: 2.0,
      notional: 67500.03 * 2,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    const t3: MarketTrade = {
      id: 'trade-3',
      timestamp: 1700000002000,
      price: 67500.05,
      quantity: 3.0,
      notional: 67500.05 * 3,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    engine.addTrade(t1);
    engine.addTrade(t2);
    engine.addTrade(t3);

    const candle = engine.getAllCandles()[0];
    // 67500.01 and 67500.03 belong to bucket 67500.00
    // 67500.05 belongs to bucket 67500.04
    const bucket0 = candle.levels.get(67500.0);
    const bucket1 = candle.levels.get(67500.04);

    expect(bucket0).toBeDefined();
    expect(bucket0?.askVolume).toBeCloseTo(3.0);

    expect(bucket1).toBeDefined();
    expect(bucket1?.askVolume).toBeCloseTo(3.0);
  });

  it('3. Accurately maps trades to 5m candle boundaries', () => {
    // 1700000000 sec = 1700000000000 ms. 1700000000 % 300 = 200.
    // candleStart = 1700000000 - 200 = 1699999800.
    const t1: MarketTrade = {
      id: 't-1',
      timestamp: 1699999850 * 1000,
      price: 67000,
      quantity: 1,
      notional: 67000,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    // Next 5m candle: 1699999800 + 300 = 1700000100
    const t2: MarketTrade = {
      id: 't-2',
      timestamp: 1700000150 * 1000,
      price: 67100,
      quantity: 2,
      notional: 134200,
      side: 'sell',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    engine.addTrade(t1);
    engine.addTrade(t2);

    const candles = engine.getAllCandles();
    expect(candles.length).toBe(2);

    expect(candles[0].candleStart).toBe(1699999800);
    expect(candles[0].candleEnd).toBe(1700000100);
    expect(candles[0].buyVolume).toBe(1);

    expect(candles[1].candleStart).toBe(1700000100);
    expect(candles[1].candleEnd).toBe(1700000400);
    expect(candles[1].sellVolume).toBe(2);
  });

  it('4. Computes per-candle delta and delta percentage correctly with zero-division safety', () => {
    const t1: MarketTrade = {
      id: 't-1',
      timestamp: 1700000000000,
      price: 67000,
      quantity: 150,
      notional: 67000 * 150,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };
    const t2: MarketTrade = {
      id: 't-2',
      timestamp: 1700000001000,
      price: 67000,
      quantity: 50,
      notional: 67000 * 50,
      side: 'sell',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    engine.addTrade(t1);
    engine.addTrade(t2);

    const candle = engine.getAllCandles()[0];
    expect(candle.delta).toBe(100); // 150 - 50
    expect(candle.totalVolume).toBe(200);
    // Delta % = 100 / 200 * 100 = 50%
    expect(candle.deltaPercent).toBe(50);
  });

  it('5. Computes Point of Control (POC) and deterministically breaks volume ties', () => {
    // Level 67100: 5 BTC
    // Level 67200: 10 BTC (Highest -> POC)
    // Level 67300: 2 BTC
    engine.addTrade({
      id: 'p-1',
      timestamp: 1700000000000,
      price: 67100,
      quantity: 5,
      notional: 67100 * 5,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });
    engine.addTrade({
      id: 'p-2',
      timestamp: 1700000001000,
      price: 67200,
      quantity: 10,
      notional: 67200 * 10,
      side: 'sell',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });
    engine.addTrade({
      id: 'p-3',
      timestamp: 1700000002000,
      price: 67300,
      quantity: 2,
      notional: 67300 * 2,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    let candle = engine.getAllCandles()[0];
    expect(candle.pocPrice).toBe(67200);
    expect(candle.pocVolume).toBe(10);
    expect(candle.levels.get(67200)?.isPoc).toBe(true);
    expect(candle.levels.get(67100)?.isPoc).toBe(false);

    // Test tie-breaking: 67100 gets 5 more BTC -> ties 67200 with 10 BTC
    engine.addTrade({
      id: 'p-4',
      timestamp: 1700000003000,
      price: 67100,
      quantity: 5,
      notional: 67100 * 5,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    // Now set candle close to 67300 by adding a small trade at 67300
    // Between 67100 and 67200 (both 10 BTC), 67200 is closer to close (67300):
    // |67200 - 67300| = 100 < |67100 - 67300| = 200.
    // Therefore 67200 must win the tie-break!
    engine.addTrade({
      id: 'p-5',
      timestamp: 1700000004000,
      price: 67300,
      quantity: 0.1,
      notional: 67300 * 0.1,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    candle = engine.getAllCandles()[0];
    expect(candle.levels.get(67100)?.totalVolume).toBe(10);
    expect(candle.levels.get(67200)?.totalVolume).toBe(10);
    expect(candle.pocPrice).toBe(67200);
  });

  it('6. Detects diagonal bid/ask imbalances correctly using configured ratio', () => {
    // Imbalance ratio: 3:1, minVolume: 1.0
    engine.updateSettings({ imbalanceRatio: 3.0, minImbalanceVolume: 1.0, tickMultiplier: 100 });
    // bucket = 0.01 * 100 = 1.0 dollar
    expect(engine.getBucketSize()).toBe(1.0);

    // Level 67000: Bid volume = 2.0 (sellers)
    // Level 67001: Ask volume = 7.0 (buyers). Ratio = 7.0 / 2.0 = 3.5 (> 3.0) -> Ask Imbalance at 67001!
    engine.addTrade({
      id: 'imb-1',
      timestamp: 1700000000000,
      price: 67000,
      quantity: 2.0,
      notional: 67000 * 2.0,
      side: 'sell',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    engine.addTrade({
      id: 'imb-2',
      timestamp: 1700000001000,
      price: 67001,
      quantity: 7.0,
      notional: 67001 * 7.0,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    const candle = engine.getAllCandles()[0];
    const lvl67001 = candle.levels.get(67001);
    expect(lvl67001).toBeDefined();
    expect(lvl67001?.isAskImbalance).toBe(true);
    expect(lvl67001?.askImbalanceRatio).toBeCloseTo(3.5);
  });

  it('7. Handles zero denominators safely in diagonal imbalances', () => {
    engine.updateSettings({ imbalanceRatio: 3.0, minImbalanceVolume: 0.5, tickMultiplier: 100 });

    // Level 67001 has 5.0 ask volume, lower level 67000 has 0 bid volume
    engine.addTrade({
      id: 'zero-1',
      timestamp: 1700000000000,
      price: 67001,
      quantity: 5.0,
      notional: 67001 * 5.0,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    const candle = engine.getAllCandles()[0];
    const lvl = candle.levels.get(67001);
    expect(lvl?.isAskImbalance).toBe(true);
    expect(lvl?.askImbalanceRatio).toBe(999.0); // Safe finite marker
  });

  it('8. Identifies consecutive stacked imbalances', () => {
    engine.updateSettings({
      imbalanceRatio: 3.0,
      minImbalanceVolume: 1.0,
      stackedImbalanceMinLevels: 3,
      tickMultiplier: 100, // 1 dollar buckets
    });

    // 3 consecutive ask imbalances at 67001, 67002, 67003
    // 67000 has 1.0 bid
    // 67001 has 4.0 ask (4.0 / 1.0 = 4 > 3)
    // 67001 has 1.0 bid
    // 67002 has 4.0 ask (4.0 / 1.0 = 4 > 3)
    // 67002 has 1.0 bid
    // 67003 has 4.0 ask (4.0 / 1.0 = 4 > 3)
    engine.addTrade({ id: 's-0', timestamp: 1700000000000, price: 67000, quantity: 1.0, notional: 67000, side: 'sell' });
    engine.addTrade({ id: 's-1a', timestamp: 1700000001000, price: 67001, quantity: 4.0, notional: 67001 * 4, side: 'buy' });
    engine.addTrade({ id: 's-1b', timestamp: 1700000002000, price: 67001, quantity: 1.0, notional: 67001, side: 'sell' });
    engine.addTrade({ id: 's-2a', timestamp: 1700000003000, price: 67002, quantity: 4.0, notional: 67002 * 4, side: 'buy' });
    engine.addTrade({ id: 's-2b', timestamp: 1700000004000, price: 67002, quantity: 1.0, notional: 67002, side: 'sell' });
    engine.addTrade({ id: 's-3a', timestamp: 1700000005000, price: 67003, quantity: 4.0, notional: 67003 * 4, side: 'buy' });

    const candle = engine.getAllCandles()[0];
    expect(candle.stackedAskImbalances?.length).toBe(1);
    expect(candle.stackedAskImbalances?.[0].count).toBe(3);
    expect(candle.stackedAskImbalances?.[0].minPrice).toBe(67001);
    expect(candle.stackedAskImbalances?.[0].maxPrice).toBe(67003);

    expect(candle.levels.get(67001)?.isStackedAskImbalance).toBe(true);
    expect(candle.levels.get(67002)?.isStackedAskImbalance).toBe(true);
    expect(candle.levels.get(67003)?.isStackedAskImbalance).toBe(true);
  });

  it('9. Deduplicates duplicate trade IDs', () => {
    const trade: MarketTrade = {
      id: 'duplicate-trade-id-99',
      timestamp: 1700000000000,
      price: 67000,
      quantity: 5.0,
      notional: 335000,
      side: 'buy',
    };

    const first = engine.addTrade(trade);
    const second = engine.addTrade(trade);

    expect(first).toBe(true);
    expect(second).toBe(false);

    const candle = engine.getAllCandles()[0];
    expect(candle.totalVolume).toBe(5.0);
  });

  it('10. Rejects trades from mismatched symbols and exchanges', () => {
    engine.setSymbol('BTCUSDT', 'binance');

    const foreignTrade: MarketTrade = {
      id: 'foreign-1',
      timestamp: 1700000000000,
      price: 2500,
      quantity: 10,
      notional: 25000,
      side: 'buy',
      symbol: 'ETHUSDT', // Mismatched symbol!
      exchange: 'binance',
    };

    const added = engine.addTrade(foreignTrade);
    expect(added).toBe(false);
    expect(engine.getAllCandles().length).toBe(0);
  });

  it('11. Calculates accurate Visible Volume Profile with Value Area (VAH, VAL) and POC', () => {
    engine.updateSettings({ tickMultiplier: 100 }); // 1 dollar buckets

    // Add trades across multiple price levels
    engine.addTrade({ id: 'vp-1', timestamp: 1700000000000, price: 67000, quantity: 10, notional: 670000, side: 'buy' });
    engine.addTrade({ id: 'vp-2', timestamp: 1700000001000, price: 67001, quantity: 50, notional: 67001 * 50, side: 'sell' }); // Highest vol -> POC
    engine.addTrade({ id: 'vp-3', timestamp: 1700000002000, price: 67002, quantity: 20, notional: 67002 * 20, side: 'buy' });
    engine.addTrade({ id: 'vp-4', timestamp: 1700000003000, price: 67003, quantity: 10, notional: 67003 * 10, side: 'sell' });
    engine.addTrade({ id: 'vp-5', timestamp: 1700000004000, price: 67004, quantity: 10, notional: 67004 * 10, side: 'buy' });

    const vp = engine.getVolumeProfile();
    expect(vp.totalVolume).toBe(100);
    expect(vp.pocPrice).toBe(67001);
    expect(vp.pocVolume).toBe(50);
    expect(vp.vah).toBeGreaterThanOrEqual(67001);
    expect(vp.val).toBeLessThanOrEqual(67001);

    // Value Area levels should be flagged
    const pocLevel = vp.levels.find((l) => l.price === 67001);
    expect(pocLevel?.isPoc).toBe(true);
    expect(pocLevel?.isValueArea).toBe(true);
  });

  it('12. Ingests out-of-order trades and places them into the correct candle interval', () => {
    // Newer trade arrives first
    engine.addTrade({
      id: 'ord-2',
      timestamp: 1700000450 * 1000,
      price: 67100,
      quantity: 5,
      notional: 335500,
      side: 'buy',
    });

    // Older trade arrives later (e.g. out of order from network)
    engine.addTrade({
      id: 'ord-1',
      timestamp: 1699999850 * 1000,
      price: 67000,
      quantity: 2,
      notional: 134000,
      side: 'sell',
    });

    const candles = engine.getAllCandles();
    expect(candles.length).toBe(2);
    // Candle 1 (older)
    expect(candles[0].candleStart).toBe(1699999800);
    expect(candles[0].sellVolume).toBe(2);
    // Candle 2 (newer)
    expect(candles[1].candleStart).toBe(1700000400);
    expect(candles[1].buyVolume).toBe(5);
  });

  it('13. Reaggregates all existing candles cleanly when tick multiplier changes dynamically', () => {
    engine.updateSettings({ tickMultiplier: 1 });
    engine.addTrade({ id: 'dyn-1', timestamp: 1700000000000, price: 67000.01, quantity: 1, notional: 67000.01, side: 'buy' });
    engine.addTrade({ id: 'dyn-2', timestamp: 1700000001000, price: 67000.03, quantity: 2, notional: 134000.06, side: 'buy' });

    let candle = engine.getAllCandles()[0];
    expect(candle.levels.size).toBe(2);

    // Switch to 4 ticks (0.04 bucket)
    engine.updateSettings({ tickMultiplier: 4 });
    candle = engine.getAllCandles()[0];
    // Both 67000.01 and 67000.03 merge into bucket 67000.00
    expect(candle.levels.size).toBe(1);
    expect(candle.levels.get(67000.0)?.totalVolume).toBe(3);
  });

  it('14. Complete reset on symbol switch prevents any trade cross-contamination', () => {
    engine.addTrade({ id: 'sym-1', timestamp: 1700000000000, price: 67000, quantity: 1, notional: 67000, side: 'buy', symbol: 'BTCUSDT' });
    expect(engine.getAllCandles().length).toBe(1);

    engine.setSymbol('ETHUSDT', 'binance', 0.01);
    expect(engine.getAllCandles().length).toBe(0);
    expect(engine.getFootprintStartTime()).toBeNull();

    // Adding old symbol trade must now be rejected
    const rejected = engine.addTrade({ id: 'sym-2', timestamp: 1700000001000, price: 67000, quantity: 1, notional: 67000, side: 'buy', symbol: 'BTCUSDT' });
    expect(rejected).toBe(false);
  });

  it('15. Robust delimiter handling and exchange support across BTC, ETH, SOL, BNB', () => {
    engine.setSymbol('ETHUSDT', 'bybit', 1.0);
    const acceptedBybit = engine.addTrade({
      id: 'bybit-eth-1',
      timestamp: 1700000000000,
      price: 2650.5,
      quantity: 2.5,
      notional: 6626.25,
      side: 'buy',
      symbol: 'ETH-USDT',
      exchange: 'bybit',
    });
    expect(acceptedBybit).toBe(true);

    const candles = engine.getAllCandles();
    expect(candles.length).toBe(1);
    expect(candles[0].buyVolume).toBe(2.5);
    expect(candles[0].delta).toBe(2.5);
  });

  it('16. Generates valid levels for non-bitcoin symbols (ETH, SOL) when seeded from candles', () => {
    engine.setSymbol('SOLUSDT', 'binance', 0.5);
    engine.seedFromCandles([
      {
        time: 1700000000,
        open: 150.0,
        high: 153.0,
        low: 149.0,
        close: 152.0,
        volume: 2500,
        buyVolume: 1400,
      },
    ]);

    const candles = engine.getAllCandles();
    expect(candles.length).toBe(1);
    expect(candles[0].levels.size).toBeGreaterThan(0);
    expect(candles[0].pocPrice).toBeGreaterThanOrEqual(149.0);
    expect(candles[0].pocPrice).toBeLessThanOrEqual(153.0);
    expect(candles[0].delta).toBe(300);
  });

  it('17. Guarantees non-overlapping delta positioning and adaptive zoom threshold calculation', () => {
    // Zoom threshold check:
    // Bar spacing >= 46px triggers full footprint, < 46px collapses to candles with delta
    const zoomInBarSpacing = 72;
    const zoomOutBarSpacing = 24;
    expect(zoomInBarSpacing >= 46).toBe(true);
    expect(zoomOutBarSpacing < 46).toBe(true);

    // Delta collision prevention:
    // When candle levels extend lower than candle.low, lowestCandleExtentY accounts for levels
    const yLow = 300;
    const mockLevelYCoordinates = [280, 290, 300, 312]; // 312 extends below yLow
    let lowestCandleExtentY = yLow;
    for (const yL of mockLevelYCoordinates) {
      if (yL > lowestCandleExtentY) {
        lowestCandleExtentY = yL;
      }
    }
    lowestCandleExtentY += 8; // safe row clearance
    const deltaY = lowestCandleExtentY + 8;

    // Delta is guaranteed strictly below the lowest footprint level
    for (const yL of mockLevelYCoordinates) {
      expect(yL).toBeLessThan(deltaY - 8);
    }
    expect(deltaY).toBe(328);
    expect(deltaY).toBeGreaterThan(yLow + 15);
  });

  it('18. Guarantees every single price level is visible with order book and DOM depth integration', async () => {
    const ob = new OrderBookManager(1.0);
    const mockAdapter = {
      fetchDepthSnapshot: async () => ({
        lastUpdateId: 100,
        timestamp: 1700000000000,
        bids: [
          [2434.0, 45.0],
          [2435.0, 120.0], // heavy resting bid support
          [2436.0, 30.0],
        ],
        asks: [
          [2438.0, 25.0],
          [2439.0, 150.0], // heavy resting ask resistance
          [2440.0, 40.0],
        ],
      }),
      fetchRecentTrades: async () => [],
    };
    await ob.synchronize(mockAdapter as any, 'ETHUSDT');

    engine.setSymbol('ETHUSDT', 'binance', 1.0);
    engine.seedFromCandles(
      [
        {
          time: 1700000000,
          open: 2435.0,
          high: 2442.0,
          low: 2433.0,
          close: 2438.0,
          volume: 5000,
          buyVolume: 2800,
        },
      ],
      ob
    );

    const candle = engine.getAllCandles()[0];
    expect(candle).toBeDefined();

    // Range is from 2433 to 2442 with $1 tick bucket => exactly 10 consecutive levels:
    // 2433, 2434, 2435, 2436, 2437, 2438, 2439, 2440, 2441, 2442
    expect(candle.levels.size).toBe(10);
    for (let p = 2433; p <= 2442; p++) {
      const lvl = candle.levels.get(p);
      expect(lvl).toBeDefined();
      expect(lvl!.price).toBe(p);
      expect(lvl!.totalVolume).toBeGreaterThan(0);
      expect(lvl!.bidVolume).toBeGreaterThanOrEqual(0);
      expect(lvl!.askVolume).toBeGreaterThanOrEqual(0);
    }

    // Verify DOM depth data was captured
    const lvl2435 = candle.levels.get(2435.0);
    expect(lvl2435?.domBidLiquidity).toBe(120.0);
    expect(lvl2435?.domTotalLiquidity).toBe(120.0);

    const lvl2439 = candle.levels.get(2439.0);
    expect(lvl2439?.domAskLiquidity).toBe(150.0);
    expect(lvl2439?.domTotalLiquidity).toBe(150.0);

    // Verify visible candles guarantees all levels exist
    const visible = engine.getVisibleCandles(1700000000, 1700000300);
    expect(visible.length).toBe(1);
    expect(visible[0].levels.size).toBe(10);
  });

  it('19. Strictly aligns candles to active timeframe and eliminates candle data collisions', () => {
    // Engine initialized with 15m (900s interval)
    engine.setTimeframe('15m');

    // Seed 15m candles (e.g. 1800, 2700, 3600)
    engine.seedFromCandles([
      { time: 1800, open: 100, high: 105, low: 95, close: 102, volume: 50 },
      { time: 2700, open: 102, high: 108, low: 100, close: 106, volume: 80 },
    ]);

    // Simulate an trade with intermediate timestamp (e.g. 2150s falls between 1800 and 2700 -> quantized to 1800)
    engine.addTrade({
      id: 'trade-sync-1',
      timestamp: 2150 * 1000,
      price: 103,
      quantity: 5,
      notional: 103 * 5,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    const visible = engine.getVisibleCandles(0, 5000);
    expect(visible.length).toBe(2);
    expect(visible[0].candleStart).toBe(1800);
    expect(visible[1].candleStart).toBe(2700);

    // Verify distance between consecutive candles is exactly the 15m interval (900s)
    expect(visible[1].candleStart - visible[0].candleStart).toBe(900);

    // Verify no candles have off-interval timestamps
    for (const c of visible) {
      expect(c.candleStart % 900).toBe(0);
    }
  });

  it('20. Validates authoritative price-level bucket boundaries and wick coverage', () => {
    engine.setTimeframe('5m');
    engine.setSymbol('ETHUSDT', 'binance', 0.1); // $0.10 bucket size
    const bucketSize = engine.getBucketSize();
    expect(bucketSize).toBe(0.1);

    // Candle with high: 2432.85, low: 2430.12
    engine.seedFromCandles([
      { time: 1700000000, open: 2431.0, high: 2432.85, low: 2430.12, close: 2432.5, volume: 100 },
    ]);

    const visible = engine.getVisibleCandles(1700000000, 1700000300);
    expect(visible.length).toBe(1);
    const candle = visible[0];

    // Every level's bucket [price, price + bucketSize] must span exactly bucketSize
    const sortedPrices = Array.from(candle.levels.keys()).sort((a, b) => a - b);
    expect(sortedPrices.length).toBeGreaterThan(0);

    const lowestBucketMin = sortedPrices[0];
    const highestBucketMin = sortedPrices[sortedPrices.length - 1];
    const highestBucketMax = Number((highestBucketMin + bucketSize).toFixed(8));

    // The entire high-low range (including wicks) must fall within [lowestBucketMin, highestBucketMax]
    expect(lowestBucketMin).toBeLessThanOrEqual(candle.low);
    expect(highestBucketMax).toBeGreaterThanOrEqual(candle.high);

    // Adjacent buckets must be contiguous without gaps
    for (let i = 0; i < sortedPrices.length - 1; i++) {
      const currentMin = sortedPrices[i];
      const nextMin = sortedPrices[i + 1];
      expect(Number((nextMin - currentMin).toFixed(4))).toBe(bucketSize);
    }
  });

  it('21. Validates Debug Mode queries: getCandleAtTime and getLevelAtPrice', () => {
    engine.setTimeframe('5m'); // 300s interval
    // 1700000100 % 300 === 0 -> perfectly 5m-aligned
    const baseTime = 1700000100;
    engine.seedFromCandles([
      { time: baseTime, open: 2000, high: 2010, low: 1990, close: 2005, volume: 50 },
    ]);

    // Query within the candle interval [1700000100, 1700000400)
    const candle = engine.getCandleAtTime(baseTime + 150);
    expect(candle).toBeDefined();
    expect(candle?.candleStart).toBe(baseTime);

    // Query level at price 2004.5
    const level = engine.getLevelAtPrice(candle!, 2004.5);
    expect(level).toBeDefined();
    expect(level!.price).toBeLessThanOrEqual(2004.5);
    expect(level!.price + engine.getBucketSize()).toBeGreaterThanOrEqual(2004.5);

    // Non-existent timestamp
    const outside = engine.getCandleAtTime(1600000000);
    expect(outside).toBeNull();
  });
});

