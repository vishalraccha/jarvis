/**
 * Mathematical & Behavioral Validation Test Suite
 * JARVIS HEATMAP TERMINAL
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { HeatmapEngine } from '../services/heatmap/HeatmapEngine';
import { ColorMapEngine } from '../services/heatmap/ColorMap';
import { TradeBubbleManager } from '../services/bubbles/TradeBubbleManager';
import { LiquidityShiftDetector } from '../services/heatmap/LiquidityShiftDetector';
import { DEFAULT_BUBBLE_SETTINGS, DEFAULT_HEATMAP_SETTINGS } from '../types/settings';
import { DepthDeltaUpdate, DepthSnapshot, MarketTrade } from '../types/market';
import { IExchangeAdapter } from '../services/exchange/ExchangeAdapter';

// Mock Exchange Adapter for testing synchronization
class MockAdapter implements Partial<IExchangeAdapter> {
  snapshotToReturn: DepthSnapshot = {
    lastUpdateId: 100,
    timestamp: 1600000000000,
    bids: [
      [65000.0, 1.5],
      [64990.0, 3.2],
    ],
    asks: [
      [65010.0, 2.0],
      [65020.0, 4.0],
    ],
  };

  async fetchDepthSnapshot(): Promise<DepthSnapshot> {
    return this.snapshotToReturn;
  }

  async fetchRecentTrades(): Promise<MarketTrade[]> {
    return [];
  }
}

describe('1. Order Book Mathematical Validation', () => {
  let orderBook: OrderBookManager;
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    orderBook = new OrderBookManager(0.01);
    mockAdapter = new MockAdapter();
  });

  it('correctly initializes from exchange depth snapshot', async () => {
    await orderBook.synchronize(mockAdapter as any, 'BTCUSDT');

    expect(orderBook.getSyncStatus()).toBe('SYNCHRONIZED');
    expect(orderBook.getBestBid()).toBe(65000.0);
    expect(orderBook.getBestAsk()).toBe(65010.0);

    const stats = orderBook.getStats();
    expect(stats.spread).toBeCloseTo(10.0);
    expect(stats.lastUpdateId).toBe(100);
    expect(stats.bidLevelsCount).toBe(2);
    expect(stats.askLevelsCount).toBe(2);
  });

  it('correctly aligns buffered updates and drops older events', async () => {
    // Buffer an older update (u <= lastUpdateId)
    orderBook.handleDepthUpdate({
      firstUpdateId: 90,
      finalUpdateId: 99,
      eventTime: 1600000000000,
      bids: [[65000.0, 99.0]],
      asks: [],
    });

    // Buffer valid consecutive update
    orderBook.handleDepthUpdate({
      firstUpdateId: 100,
      finalUpdateId: 101,
      eventTime: 1600000000100,
      bids: [[65005.0, 2.5]], // Higher bid
      asks: [],
    });

    await orderBook.synchronize(mockAdapter as any, 'BTCUSDT');

    expect(orderBook.getSyncStatus()).toBe('SYNCHRONIZED');
    // The new bid at 65005.0 should be applied
    expect(orderBook.getBestBid()).toBe(65005.0);
    expect(orderBook.getStats().lastUpdateId).toBe(101);
  });

  it('removes level completely when quantity is zero', async () => {
    await orderBook.synchronize(mockAdapter as any, 'BTCUSDT');

    // Send delta that cancels 65000.0 bid
    orderBook.handleDepthUpdate({
      firstUpdateId: 101,
      finalUpdateId: 102,
      eventTime: 1600000000200,
      bids: [[65000.0, 0.0]], // Removed!
      asks: [],
    });

    expect(orderBook.getBestBid()).toBe(64990.0); // Next best bid
    const profile = orderBook.getDepthProfile();
    expect(profile.bids.find((b) => b.price === 65000.0)).toBeUndefined();
  });

  it('detects sequence gap and transitions to DESYNCHRONIZED', async () => {
    await orderBook.synchronize(mockAdapter as any, 'BTCUSDT');

    // Last update was 100. Send gap update: firstUpdateId = 110 (missing 101-109)
    orderBook.handleDepthUpdate({
      firstUpdateId: 110,
      finalUpdateId: 115,
      eventTime: 1600000000300,
      bids: [[65005.0, 1.0]],
      asks: [],
    });

    expect(orderBook.getSyncStatus()).toBe('DESYNCHRONIZED');
    expect(orderBook.getStats().sequenceGapsDetected).toBe(1);
  });
});

describe('2. Heatmap Engine & Historical Persistence Validation', () => {
  let orderBook: OrderBookManager;
  let heatmapEngine: HeatmapEngine;
  let mockAdapter: MockAdapter;

  beforeEach(async () => {
    orderBook = new OrderBookManager(0.01);
    mockAdapter = new MockAdapter();
    heatmapEngine = new HeatmapEngine(100);
    await orderBook.synchronize(mockAdapter as any, 'BTCUSDT');
  });

  it('preserves historical liquidity slice after an order is cancelled', () => {
    // 1. Take slice 1 at T1
    const slice1 = heatmapEngine.sampleOrderBook(orderBook, 100);
    expect(slice1).not.toBeNull();
    expect(slice1!.levels.get(65000.0)).toBe(1.5);

    // 2. Order is removed from book at T2
    orderBook.handleDepthUpdate({
      firstUpdateId: 101,
      finalUpdateId: 102,
      eventTime: Date.now() + 200,
      bids: [[65000.0, 0.0]],
      asks: [],
    });

    // 3. Take slice 2 at T2
    // Advance internal clock
    heatmapEngine.setSamplingInterval(50);
    // Wait small amount or force sample
    const slice2 = heatmapEngine.sampleOrderBook(orderBook, 100);

    // Check slice 1 still preserves the 65000.0 liquidity!
    const historicalSlices = heatmapEngine.getAllSlices();
    expect(historicalSlices[0].levels.get(65000.0)).toBe(1.5);
  });

  it('never fabricates nonzero liquidity for empty unobserved cells', () => {
    const slice = heatmapEngine.sampleOrderBook(orderBook, 100);
    expect(slice).not.toBeNull();
    // 64995.0 was never in snapshot or deltas
    expect(slice!.levels.has(64995.0)).toBe(false);
  });
});

describe('3. Colormap Determinism & Cutoff Validation', () => {
  let colorMap: ColorMapEngine;

  beforeEach(() => {
    colorMap = new ColorMapEngine();
  });

  it('produces identical colors deterministically for identical inputs', () => {
    const c1 = colorMap.getColor(2.5, 0.1, 10.0, DEFAULT_HEATMAP_SETTINGS);
    const c2 = colorMap.getColor(2.5, 0.1, 10.0, DEFAULT_HEATMAP_SETTINGS);

    expect(c1.r).toBe(c2.r);
    expect(c1.g).toBe(c2.g);
    expect(c1.b).toBe(c2.b);
    expect(c1.hex).toBe(c2.hex);
  });

  it('suppresses noise below lower cutoff', () => {
    const settings = { ...DEFAULT_HEATMAP_SETTINGS, lowerCutoffAbsolute: 1.0 };
    const color = colorMap.getColor(0.5, 0.1, 10.0, settings);
    // Below cutoff should be transparent / empty
    expect(color.a).toBe(0);
  });

  it('scales intensity monotonically with liquidity quantity', () => {
    const low = colorMap.getColor(2.0, 0.0, 10.0, DEFAULT_HEATMAP_SETTINGS);
    const mid = colorMap.getColor(5.0, 0.0, 10.0, DEFAULT_HEATMAP_SETTINGS);
    const high = colorMap.getColor(10.0, 0.0, 10.0, DEFAULT_HEATMAP_SETTINGS);

    // High liquidity should have strong red/warm channel compared to low (which is blue)
    expect(high.r).toBeGreaterThan(low.r);
    expect(low.b).toBeGreaterThan(high.b);
  });
});

describe('4. Trade Bubbles & Aggressor Side Classification', () => {
  let bubbleManager: TradeBubbleManager;

  beforeEach(() => {
    bubbleManager = new TradeBubbleManager({
      ...DEFAULT_BUBBLE_SETTINGS,
      minTradeNotional: 1000,
      aggregationIntervalMs: 200,
    });
  });

  it('classifies buyer vs seller aggressor correctly according to Binance maker flag', () => {
    // isBuyerMaker = false -> Buyer is taker -> Aggressive Buy
    const buyTrade: MarketTrade = {
      id: '1',
      timestamp: 1000,
      price: 65000,
      quantity: 0.1,
      notional: 6500,
      side: 'buy',
      isBuyerMaker: false,
    };
    const buyBubble = bubbleManager.addTrade(buyTrade);
    expect(buyBubble).not.toBeNull();
    expect(buyBubble!.dominantSide).toBe('buy');

    // isBuyerMaker = true -> Buyer is maker -> Seller is taker -> Aggressive Sell
    const sellTrade: MarketTrade = {
      id: '2',
      timestamp: 1500,
      price: 65000,
      quantity: 0.2,
      notional: 13000,
      side: 'sell',
      isBuyerMaker: true,
    };
    const sellBubble = bubbleManager.addTrade(sellTrade);

    expect(sellBubble).not.toBeNull();
    expect(sellBubble!.dominantSide).toBe('sell');
  });

  it('filters dust trades below minimum notional threshold', () => {
    const dustTrade: MarketTrade = {
      id: '99',
      timestamp: 2000,
      price: 65000,
      quantity: 0.001,
      notional: 65, // < 1000 USD
      side: 'buy',
      isBuyerMaker: false,
    };
    const res = bubbleManager.addTrade(dustTrade);
    expect(res).toBeNull();
  });

  it('scales radius within configured min and max bounds', () => {
    const largeBubble = {
      id: 'b1',
      timestamp: 1000,
      price: 65000,
      buyQty: 10,
      sellQty: 0,
      totalQty: 10,
      totalNotional: 650000,
      buyRatio: 1.0,
      tradeCount: 5,
      dominantSide: 'buy' as const,
    };
    const r = bubbleManager.calculateRadius(largeBubble, DEFAULT_BUBBLE_SETTINGS);
    expect(r).toBeGreaterThanOrEqual(DEFAULT_BUBBLE_SETTINGS.minRadiusPx);
    expect(r).toBeLessThanOrEqual(DEFAULT_BUBBLE_SETTINGS.maxRadiusPx);
  });

  it('dynamically filters visible bubbles based on minTradeNotional adjustment', () => {
    // Add small trade ($2,000) and large trade ($50,000)
    bubbleManager.addTrade({
      id: 'small',
      timestamp: 1000,
      price: 65000,
      quantity: 0.0308,
      notional: 2000,
      side: 'buy',
      isBuyerMaker: false,
    });
    bubbleManager.addTrade({
      id: 'large',
      timestamp: 2000,
      price: 65000,
      quantity: 0.7692,
      notional: 50000,
      side: 'sell',
      isBuyerMaker: true,
    });

    // When threshold is $1,000, both are visible
    const lowThresholdBubbles = bubbleManager.getVisibleBubbles(500, 3000, {
      ...DEFAULT_BUBBLE_SETTINGS,
      minTradeNotional: 1000,
    });
    expect(lowThresholdBubbles.length).toBe(2);

    // When user adjusts threshold to $25,000, only the large trade is visible
    const highThresholdBubbles = bubbleManager.getVisibleBubbles(500, 3000, {
      ...DEFAULT_BUBBLE_SETTINGS,
      minTradeNotional: 25000,
    });
    expect(highThresholdBubbles.length).toBe(1);
    expect(highThresholdBubbles[0].totalNotional).toBeGreaterThanOrEqual(25000);
  });

  it('notifies subscribers immediately when trades are added', () => {
    let notified = false;
    bubbleManager.subscribe(() => {
      notified = true;
    });

    bubbleManager.addTrade({
      id: 'notify_test',
      timestamp: 3000,
      price: 65000,
      quantity: 0.1,
      notional: 6500,
      side: 'buy',
      isBuyerMaker: false,
    });

    expect(notified).toBe(true);
  });
});

describe('5. Liquidity Shift Detection Validation', () => {
  let detector: LiquidityShiftDetector;

  beforeEach(() => {
    detector = new LiquidityShiftDetector();
  });

  it('detects added and removed liquidity correctly', () => {
    const slice1 = {
      timestamp: 1000,
      bestBid: 65000,
      bestAsk: 65010,
      levels: new Map([[65000, 1.0]]),
      bids: new Map([[65000, 1.0]]),
      asks: new Map(),
      totalBidLiquidity: 1.0,
      totalAskLiquidity: 0,
    };

    const slice2 = {
      timestamp: 1250,
      bestBid: 65000,
      bestAsk: 65010,
      levels: new Map([
        [65000, 2.5], // Added 1.5 BTC
        [65050, 3.0], // Newly added 3.0 BTC
      ]),
      bids: new Map([[65000, 2.5]]),
      asks: new Map([[65050, 3.0]]),
      totalBidLiquidity: 2.5,
      totalAskLiquidity: 3.0,
    };

    const shifts = detector.detectShifts(slice1, slice2);
    expect(shifts.length).toBe(2);

    const replenished = shifts.find((s) => s.price === 65000);
    expect(replenished?.type).toBe('replenished');
    expect(replenished?.deltaQty).toBeCloseTo(1.5);

    const added = shifts.find((s) => s.price === 65050);
    expect(added?.type).toBe('added');
    expect(added?.deltaQty).toBe(3.0);
  });
});
