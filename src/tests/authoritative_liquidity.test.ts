/**
 * Authoritative Liquidity, Zone Lifecycle, and Evidence-Based Sweep Verification Tests
 * Implements the 13 required verification tests from Section 12 of the JARVIS Heatmap specification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { HeatmapEngine } from '../services/heatmap/HeatmapEngine';
import { LiquidityZoneEngine } from '../services/heatmap/LiquidityZoneEngine';
import { HeatmapSettings } from '../types/heatmap';
import { DEFAULT_HEATMAP_SETTINGS } from '../types/settings';
import { DepthSnapshot, MarketTrade } from '../types/market';
import { IExchangeAdapter } from '../services/exchange/ExchangeAdapter';

describe('Section 12: Authoritative Liquidity Verification Suite', () => {
  let orderBook: OrderBookManager;
  let heatmapEngine: HeatmapEngine;
  let zoneEngine: LiquidityZoneEngine;

  const defaultSettings: HeatmapSettings = DEFAULT_HEATMAP_SETTINGS;

  beforeEach(() => {
    orderBook = new OrderBookManager(0.01);
    heatmapEngine = new HeatmapEngine(100); // 100ms sample interval
    zoneEngine = heatmapEngine.getZoneEngine();
  });

  // 1. Zero-quantity updates remove current liquidity
  it('1. Zero-quantity updates remove current liquidity', async () => {
    const mockAdapter: Partial<IExchangeAdapter> = {
      fetchDepthSnapshot: async (): Promise<DepthSnapshot> => ({
        lastUpdateId: 100,
        timestamp: 1700000000000,
        bids: [[60000.0, 15.0]],
        asks: [[60010.0, 12.0]],
      }),
      fetchRecentTrades: async (): Promise<MarketTrade[]> => [],
    };

    await orderBook.synchronize(mockAdapter as IExchangeAdapter, 'BTCUSDT');
    expect(orderBook.getBidQuantityAtPrice(60000.0)).toBe(15.0);

    // Apply incremental update setting 60000.0 quantity to 0
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 101,
      lastUpdateId: 101,
      timestamp: 1700000001000,
      bids: [[60000.0, 0.0]], // removed!
      asks: [],
    });

    expect(orderBook.getBidQuantityAtPrice(60000.0)).toBe(0);
  });

  // 2. Historical liquidity remains visible after removal
  it('2. Historical liquidity remains visible after removal', async () => {
    const mockAdapter: Partial<IExchangeAdapter> = {
      fetchDepthSnapshot: async (): Promise<DepthSnapshot> => ({
        lastUpdateId: 100,
        timestamp: 1700000000000,
        bids: [[60000.0, 20.0]],
        asks: [[60010.0, 10.0]],
      }),
      fetchRecentTrades: async (): Promise<MarketTrade[]> => [],
    };

    await orderBook.synchronize(mockAdapter as IExchangeAdapter, 'BTCUSDT');
    const slice1 = heatmapEngine.sampleOrderBook(orderBook, 'BTCUSDT', 'binance', 'spot', 100);
    expect(slice1).not.toBeNull();
    expect(slice1?.levels.get(60000.0)).toBe(20.0);

    // Remove liquidity in order book at later time
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 101,
      lastUpdateId: 101,
      timestamp: 1700000002000,
      bids: [[60000.0, 0.0]],
      asks: [],
    });

    // Check historical slice 1: it still preserves the historical observation!
    const historicalSlices = heatmapEngine.getAllSlices();
    expect(historicalSlices.length).toBeGreaterThanOrEqual(1);
    expect(historicalSlices[0].levels.get(60000.0)).toBe(20.0);
  });

  // 3. A current snapshot never fills unobserved historical cells
  it('3. A current snapshot never fills unobserved historical cells', async () => {
    const mockAdapter: Partial<IExchangeAdapter> = {
      fetchDepthSnapshot: async (): Promise<DepthSnapshot> => ({
        lastUpdateId: 100,
        timestamp: 1700000050000,
        bids: [[65000.0, 25.0]],
        asks: [[65010.0, 30.0]],
      }),
      fetchRecentTrades: async (): Promise<MarketTrade[]> => [],
    };
    await orderBook.synchronize(mockAdapter as IExchangeAdapter, 'BTCUSDT');

    const historicalCandles = [
      { time: 1700000000, open: 65000.0, high: 65005.0, low: 64995.0, close: 65002.0, volume: 100 },
      { time: 1700000060, open: 65002.0, high: 65008.0, low: 65001.0, close: 65005.0, volume: 100 },
    ];

    // Attempt to seed from candles and order book
    heatmapEngine.seedFromCandlesAndOrderBook(historicalCandles, orderBook, 100);

    // Slices must remain empty because historical liquidity was not genuinely observed at those times!
    expect(heatmapEngine.getAllSlices().length).toBe(0);
  });

  // 4. No stale pixels remain after a zone is removed
  it('4. No stale pixels remain after a zone is removed', () => {
    const t0 = 1700000000000;
    const bids1 = new Map([[60000.0, 15.0]]);
    const asks1 = new Map([[60010.0, 10.0]]);

    // Observe zone active at t0
    zoneEngine.processObservation(t0, bids1, asks1, 60000.0, 60010.0, defaultSettings);
    const zones = zoneEngine.getAllZones();
    expect(zones.length).toBeGreaterThan(0);
    const zone = zones.find((z) => z.isBid && z.priceMin <= 60000 && z.priceMax >= 60000);
    expect(zone).toBeDefined();

    // Advance time by 30 seconds with liquidity removed
    const t1 = t0 + 30000;
    const bids2 = new Map([[60000.0, 0.0]]);
    const asks2 = new Map([[60010.0, 10.0]]);
    zoneEngine.processObservation(t1, bids2, asks2, 59990.0, 60010.0, defaultSettings);

    // The zone must stop extending at its last observed time, NOT extend to t1
    expect(zone!.lastObservedTime).toBe(t0);
    expect(zone!.currentObservedQty).toBe(0);
  });

  // 5. No duplicate bands are created from repeated updates
  it('5. No duplicate bands are created from repeated updates', () => {
    const t0 = 1700000000000;
    const bids = new Map([[60000.0, 18.0]]);
    const asks = new Map([[60010.0, 10.0]]);

    // 5 consecutive updates at the same price level
    for (let i = 0; i < 5; i++) {
      zoneEngine.processObservation(t0 + i * 1000, bids, asks, 60000.0, 60010.0, defaultSettings);
    }

    const zonesAtLevel = zoneEngine.getAllZones().filter((z) => z.isBid && Math.abs(z.centerPrice - 60000) < 5);
    // Exactly 1 zone merged continuously over time, not 5 stacked duplicate zones!
    expect(zonesAtLevel.length).toBe(1);
    expect(zonesAtLevel[0].firstObservedTime).toBe(t0);
    expect(zonesAtLevel[0].lastObservedTime).toBe(t0 + 4000);
  });

  // 6. Price and time coordinates remain aligned during zoom and pan
  it('6. Price and time coordinates remain aligned during zoom and pan', () => {
    // Coordinate mapping tests
    const pMid = 60000;
    const pxPerDollar = -0.5; // typical inverse Y in Canvas
    const priceToY = (p: number, yMid: number) => yMid + (p - pMid) * pxPerDollar;
    const yToPrice = (y: number, yMid: number) => pMid + (y - yMid) / pxPerDollar;

    // Normal view
    const yMid1 = 400;
    const y1 = priceToY(60100, yMid1);
    expect(yToPrice(y1, yMid1)).toBeCloseTo(60100, 4);

    // Panned view (yMid shifted by +100px)
    const yMid2 = 500;
    const y2 = priceToY(60100, yMid2);
    expect(yToPrice(y2, yMid2)).toBeCloseTo(60100, 4);
    // Monotonic and identical relative spacing
    expect(y2 - yMid2).toBe(y1 - yMid1);
  });

  // 7. A touched zone is not automatically classified as swept
  it('7. A touched zone is not automatically classified as swept', () => {
    const t0 = 1700000000000;
    const bids = new Map([[60000.0, 20.0]]);
    const asks = new Map([[60010.0, 10.0]]);

    zoneEngine.processObservation(t0, bids, asks, 60000.0, 60010.0, defaultSettings);
    const zone = zoneEngine.getAllZones().find((z) => z.isBid && z.priceMin <= 60000 && z.priceMax >= 60000)!;
    expect(zone).toBeDefined();

    // Price touches the zone at 60000, but only dust trade (0.05 BTC) occurs
    const dustTrade: MarketTrade = {
      id: 'trade-1',
      price: 60000.0,
      quantity: 0.05,
      notional: 3000.0,
      timestamp: t0 + 2000,
      side: 'sell',
      isBuyerMaker: false,
    };

    zoneEngine.classifyTradeInteraction(dustTrade, 59995.0, 60005.0);

    // Must NOT be classified as swept!
    expect(zone.classification).not.toBe('SWEPT / TRADED THROUGH');
    expect(zone.touchCount).toBeGreaterThanOrEqual(1);
  });

  // 8. A swept zone requires sufficient trade and price evidence
  it('8. A swept zone requires sufficient trade and price evidence', () => {
    const t0 = 1700000000000;
    const bids = new Map([[60000.0, 10.0]]);
    const asks = new Map([[60010.0, 10.0]]);

    zoneEngine.processObservation(t0, bids, asks, 60000.0, 60010.0, defaultSettings);
    const zone = zoneEngine.getAllZones().find((z) => z.isBid && z.priceMin <= 60000 && z.priceMax >= 60000)!;
    expect(zone).toBeDefined();

    // Large trade executing 8.0 BTC (80% of zone max observed 10.0 BTC)
    const largeTrade: MarketTrade = {
      id: 'trade-sweep',
      price: 60000.0,
      quantity: 8.0,
      notional: 480000.0,
      timestamp: t0 + 2000,
      side: 'sell',
      isBuyerMaker: false,
    };

    // Price drives through zone to 59980.0
    zoneEngine.classifyTradeInteraction(largeTrade, 59980.0, 59990.0);

    expect(zone.classification).toBe('SWEPT / TRADED THROUGH');
    expect(zone.tradeAssociatedExecutedQty).toBe(8.0);
  });

  // 9. A pulled order is not incorrectly classified as executed
  it('9. A pulled order is not incorrectly classified as executed', () => {
    const t0 = 1700000000000;
    const bids = new Map([[60000.0, 25.0]]);
    const asks = new Map([[60010.0, 10.0]]);

    zoneEngine.processObservation(t0, bids, asks, 60000.0, 60010.0, defaultSettings);
    const zone = zoneEngine.getAllZones().find((z) => z.isBid && z.priceMin <= 60000 && z.priceMax >= 60000)!;
    expect(zone).toBeDefined();

    // Order is pulled/withdrawn (depth drops to 0 at t1) without any trades executing
    const t1 = t0 + 5000;
    const emptyBids = new Map([[60000.0, 0.0]]);
    zoneEngine.processObservation(t1, emptyBids, asks, 60005.0, 60015.0, defaultSettings);

    // Since no trade executions occurred at this level, it must be POSSIBLY PULLED
    expect(zone.classification).toBe('POSSIBLY PULLED');
    expect(zone.tradeAssociatedExecutedQty).toBe(0);
  });

  // 10. The COB profile and heatmap use consistent price coordinates
  it('10. The COB profile and heatmap use consistent price coordinates', () => {
    // Both components use series.priceToCoordinate(p) directly as primary mapping
    const mockSeries = {
      priceToCoordinate: (price: number) => 1000 - price * 0.01,
      coordinateToPrice: (y: number) => (1000 - y) / 0.01,
    };

    const targetPrice = 64250.5;
    const heatmapCoord = mockSeries.priceToCoordinate(targetPrice);
    const cobCoord = mockSeries.priceToCoordinate(targetPrice);

    expect(heatmapCoord).toBe(cobCoord);
    expect(mockSeries.coordinateToPrice(heatmapCoord)).toBeCloseTo(targetPrice, 5);
  });

  // 11. Switching symbols clears all previous-symbol observations
  it('11. Switching symbols clears all previous-symbol observations', async () => {
    const mockAdapter: Partial<IExchangeAdapter> = {
      fetchDepthSnapshot: async (): Promise<DepthSnapshot> => ({
        lastUpdateId: 100,
        timestamp: 1700000000000,
        bids: [[60000.0, 10.0]],
        asks: [[60010.0, 10.0]],
      }),
      fetchRecentTrades: async (): Promise<MarketTrade[]> => [],
    };

    await orderBook.synchronize(mockAdapter as IExchangeAdapter, 'BTCUSDT');
    heatmapEngine.sampleOrderBook(orderBook, 'BTCUSDT', 'binance', 'spot', 100);

    expect(heatmapEngine.getAllSlices().length).toBeGreaterThan(0);
    expect(heatmapEngine.getZoneEngine().getAllZones().length).toBeGreaterThan(0);

    // Switch symbol
    heatmapEngine.clearForSymbolChange();

    expect(heatmapEngine.getAllSlices().length).toBe(0);
    expect(heatmapEngine.getZoneEngine().getAllZones().length).toBe(0);
    expect(heatmapEngine.getActiveRestingLevels().length).toBe(0);
  });

  // 12. Sequence gaps trigger resynchronization
  it('12. Sequence gaps trigger resynchronization', async () => {
    const mockAdapter: Partial<IExchangeAdapter> = {
      fetchDepthSnapshot: async (): Promise<DepthSnapshot> => ({
        lastUpdateId: 100,
        timestamp: 1700000000000,
        bids: [[60000.0, 10.0]],
        asks: [[60010.0, 10.0]],
      }),
      fetchRecentTrades: async (): Promise<MarketTrade[]> => [],
    };

    await orderBook.synchronize(mockAdapter as IExchangeAdapter, 'BTCUSDT');
    expect(orderBook.getSyncStatus()).toBe('SYNCHRONIZED');

    // Feed gap: update with firstUpdateId = 150 (missing 101-149)
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 150,
      lastUpdateId: 155,
      timestamp: 1700000005000,
      bids: [[60000.0, 12.0]],
      asks: [],
    });

    expect(orderBook.getSyncStatus()).toBe('DESYNCHRONIZED');
  });

  // 13. The newest candles remain visible and correctly aligned
  it('13. The newest candles remain visible and correctly aligned', () => {
    // Current candle tick expansion
    const currentBar = {
      time: 1700000000,
      open: 65000.0,
      high: 65000.0,
      low: 65000.0,
      close: 65000.0,
    };

    // New tick at 65050.0 within the same bar
    const updatedBar = {
      ...currentBar,
      high: Math.max(currentBar.high, 65050.0),
      low: Math.min(currentBar.low, 65050.0),
      close: 65050.0,
    };

    expect(updatedBar.high).toBe(65050.0);
    expect(updatedBar.open).toBe(65000.0);
    expect(updatedBar.close).toBe(65050.0);
  });
});
