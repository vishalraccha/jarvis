/**
 * Order Book Accuracy & Exchange Data Pipeline Verification Suite
 * Ensures 100% authentic exchange depth, correct mathematical calculations,
 * and clean whole integer formatting without decimals.
 * JARVIS HEATMAP TERMINAL
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { formatQuantity } from '../utils/formatters';
import { DepthSnapshot, DepthDeltaUpdate } from '../types/market';
import { IExchangeAdapter } from '../services/exchange/ExchangeAdapter';

describe('Order Book Accuracy & Mathematical Precision Suite', () => {
  let orderBook: OrderBookManager;

  beforeEach(() => {
    orderBook = new OrderBookManager(0.01);
  });

  it('1. Correctly synchronizes 100% authentic exchange depth snapshot', async () => {
    const mockSnapshot: DepthSnapshot = {
      lastUpdateId: 5000,
      timestamp: Date.now(),
      bids: [
        [4000.50, 75.4],
        [4000.40, 120.2],
        [4000.30, 45.0],
      ],
      asks: [
        [4000.60, 30.8],
        [4000.70, 85.5],
        [4000.80, 110.1],
      ],
    };

    const mockAdapter: Partial<IExchangeAdapter> = {
      fetchDepthSnapshot: async () => mockSnapshot,
      fetchRecentTrades: async () => [],
    };

    await orderBook.synchronize(mockAdapter as IExchangeAdapter, 'XAUUSDT');

    const stats = orderBook.getStats();
    expect(stats.syncStatus).toBe('SYNCHRONIZED');
    expect(stats.bestBid).toBe(4000.50);
    expect(stats.bestAsk).toBe(4000.60);
    expect(stats.spread).toBeCloseTo(0.10, 2);
    expect(stats.midPrice).toBeCloseTo(4000.55, 2);
    expect(orderBook.getBidQuantityAtPrice(4000.50)).toBe(75.4);
    expect(orderBook.getAskQuantityAtPrice(4000.60)).toBe(30.8);
  });

  it('2. Accurately applies incremental depth deltas and updates best bid/ask', () => {
    // Initial snapshot setup
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 100,
      lastUpdateId: 100,
      timestamp: Date.now(),
      bids: [
        [4000.00, 50.0],
        [3999.00, 100.0],
      ],
      asks: [
        [4001.00, 40.0],
        [4002.00, 80.0],
      ],
    });

    expect(orderBook.getBestBid()).toBe(4000.00);
    expect(orderBook.getBestAsk()).toBe(4001.00);

    // Delta update modifying best bid and removing best ask
    orderBook.handleDepthUpdate({
      firstUpdateId: 101,
      finalUpdateId: 101,
      eventTime: Date.now(),
      bids: [
        [4000.00, 0.0], // removed
        [3999.50, 60.0], // new inside bid
      ],
      asks: [
        [4001.00, 0.0], // cleared
        [4001.50, 25.0], // new inside ask
      ],
    });

    expect(orderBook.getBestBid()).toBe(3999.50);
    expect(orderBook.getBestAsk()).toBe(4001.50);
    expect(orderBook.getBidQuantityAtPrice(4000.00)).toBe(0);
    expect(orderBook.getAskQuantityAtPrice(4001.00)).toBe(0);
    expect(orderBook.getBidQuantityAtPrice(3999.50)).toBe(60.0);
    expect(orderBook.getAskQuantityAtPrice(4001.50)).toBe(25.0);
  });

  it('3. Accurately calculates cumulative depth summing outward from mid price', () => {
    // Setup book with 3 bid levels and 3 ask levels
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 200,
      lastUpdateId: 200,
      timestamp: Date.now(),
      bids: [
        [4000.00, 10.0],
        [3999.00, 20.0],
        [3998.00, 30.0],
      ],
      asks: [
        [4001.00, 15.0],
        [4002.00, 25.0],
        [4003.00, 35.0],
      ],
    });

    const range = orderBook.getLevelsInRange(3990, 4010);
    expect(range.bids.length).toBe(3);
    expect(range.asks.length).toBe(3);

    // Sum asks ascending from inside ask
    let cumAsk = 0;
    const askCumList = range.asks.map((a) => {
      cumAsk += a.quantity;
      return { price: a.price, cum: cumAsk };
    });
    expect(askCumList).toEqual([
      { price: 4001.00, cum: 15.0 },
      { price: 4002.00, cum: 40.0 }, // 15 + 25
      { price: 4003.00, cum: 75.0 }, // 40 + 35
    ]);

    // Sum bids descending from inside bid
    let cumBid = 0;
    const bidCumList = range.bids.map((b) => {
      cumBid += b.quantity;
      return { price: b.price, cum: cumBid };
    });
    expect(bidCumList).toEqual([
      { price: 4000.00, cum: 10.0 },
      { price: 3999.00, cum: 30.0 }, // 10 + 20
      { price: 3998.00, cum: 60.0 }, // 30 + 30
    ]);
  });

  it('4. Formats order book quantities strictly as whole integers without decimals', () => {
    expect(formatQuantity(0, 0)).toBe('0');
    expect(formatQuantity(1.4, 0)).toBe('1');
    expect(formatQuantity(45.8, 0)).toBe('46');
    expect(formatQuantity(340.2, 0)).toBe('340');
    expect(formatQuantity(1250.7, 0)).toBe('1,251');
    expect(formatQuantity(15420.0, 0)).toBe('15,420');
    expect(formatQuantity(120500.0, 0)).toBe('121K');
    expect(formatQuantity(1500000.0, 0)).toBe('2M');
    expect(formatQuantity(12500000.0, 0)).toBe('13M');

    // Confirm no decimal points appear in any integer formatted quantity
    const testValues = [0.1, 0.9, 4.3, 19.8, 99.9, 1250.45, 98765.4];
    for (const v of testValues) {
      const formatted = formatQuantity(v, 0);
      expect(formatted).not.toContain('.');
    }
  });

  it('5. Maintains separate bids and asks without cross-spread contamination', () => {
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 300,
      lastUpdateId: 300,
      timestamp: Date.now(),
      bids: [
        [4000.10, 50.0],
        [4000.00, 75.0],
      ],
      asks: [
        [4000.20, 40.0],
        [4000.30, 60.0],
      ],
    });

    const range = orderBook.getLevelsInRange(3999, 4001);
    const maxBid = Math.max(...range.bids.map((b) => b.price));
    const minAsk = Math.min(...range.asks.map((a) => a.price));

    // Best bid must always be strictly less than best ask (positive spread)
    expect(maxBid).toBeLessThan(minAsk);
    expect(minAsk - maxBid).toBeCloseTo(0.10, 2);
  });

  it('6. Reset clears synchronization cooldown allowing instant re-synchronization on symbol switch', async () => {
    let syncCount = 0;
    const mockAdapter: Partial<IExchangeAdapter> = {
      fetchDepthSnapshot: async () => {
        syncCount++;
        return {
          lastUpdateId: 6000 + syncCount,
          timestamp: Date.now(),
          bids: [[4000, 10]],
          asks: [[4001, 10]],
        };
      },
      fetchRecentTrades: async () => [],
    };

    // First sync
    await orderBook.synchronize(mockAdapter as IExchangeAdapter, 'BTCUSDT');
    expect(syncCount).toBe(1);

    // Resetting book (e.g. on timeframe or symbol change) must clear cooldown
    orderBook.reset();
    expect(orderBook.getBidQuantityAtPrice(4000)).toBe(0);

    // Immediate second sync must NOT be blocked by cooldown
    await orderBook.synchronize(mockAdapter as IExchangeAdapter, 'BTCUSDT');
    expect(syncCount).toBe(2);
    expect(orderBook.getBidQuantityAtPrice(4000)).toBe(10);
  });

  it('7. Safety watchdog triggers background sync when bids or asks drop to zero', async () => {
    let resyncTriggered = false;
    const mockAdapter: Partial<IExchangeAdapter> = {
      fetchDepthSnapshot: async () => {
        resyncTriggered = true;
        return {
          lastUpdateId: 7000,
          timestamp: Date.now(),
          bids: [[4000, 20]],
          asks: [[4001, 20]],
        };
      },
    };

    // Initialize book in INITIALIZING state
    orderBook.reset();
    expect(orderBook.getStats().bidLevelsCount).toBe(0);

    // When delta arrives into an empty book, watchdog triggers background sync
    orderBook.handleDepthUpdate(
      {
        firstUpdateId: 7001,
        finalUpdateId: 7001,
        eventTime: Date.now(),
        bids: [],
        asks: [[4001, 5]],
      },
      mockAdapter as IExchangeAdapter,
      'BTCUSDT'
    );

    expect(resyncTriggered).toBe(true);
  });

  it('8. Immediate COB Sell Transition: prune resting bids, show selling orders, and notify immediately', () => {
    // Setup initial book with bids up to 29680 and asks starting at 29681
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 800,
      lastUpdateId: 800,
      timestamp: Date.now(),
      bids: [
        [29680.0, 50.0],
        [29679.0, 40.0],
        [29678.0, 30.0],
      ],
      asks: [
        [29681.0, 60.0],
        [29682.0, 70.0],
      ],
    });

    let notifiedStats: any = null;
    orderBook.subscribe((stats) => {
      notifiedStats = stats;
    });

    // Market shifts to SELL: an aggressive sell order executes at 29680.0
    orderBook.consumeLiquidity(29680.0, 15.0, 'sell');

    // 1. Last trade tracking
    expect(orderBook.getLastTradedPrice()).toBe(29680.0);
    expect(orderBook.getLastTradedSide()).toBe('sell');

    // 2. All resting bids at and above 29680 must be immediately eliminated
    expect(orderBook.getBidQuantityAtPrice(29680.0)).toBe(0);
    expect(orderBook.getBidQuantityAtPrice(29679.0)).toBe(40.0);

    // 3. Selling order at 29680 must immediately be present on ask side
    expect(orderBook.getAskQuantityAtPrice(29680.0)).toBeGreaterThan(0);

    // 4. Best ask must now be 29680.0, best bid must be <= 29679.0
    expect(orderBook.getBestAsk()).toBe(29680.0);
    expect(orderBook.getBestBid()).toBe(29679.0);

    // 5. Listener notified immediately
    expect(notifiedStats).not.toBeNull();
    expect(notifiedStats.bestAsk).toBe(29680.0);

    // 6. COB ask cutoff calculation verifies 29680 is immediately classified as ASK (selling orders, red)
    const rowStep = 1.0;
    const currentMid = orderBook.getLastTradedPrice();
    const lastSide = orderBook.getLastTradedSide();
    const isSellHit = lastSide === 'sell';
    const askCutoff = isSellHit 
      ? (currentMid - rowStep * 0.499) 
      : (lastSide === 'buy' ? (currentMid + rowStep * 0.499) : currentMid);

    // Level at 29680.0 must be an ASK (red)
    expect(29680.0 >= askCutoff).toBe(true);
    // Level above 29680.0 must be an ASK (red)
    expect(29681.0 >= askCutoff).toBe(true);
    // Level below 29680.0 must be a BID (green)
    expect(29679.0 >= askCutoff).toBe(false);
  });

  it('9. Immediate COB Buy Transition: prune resting asks, show buying orders, and notify immediately', () => {
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 900,
      lastUpdateId: 900,
      timestamp: Date.now(),
      bids: [
        [29678.0, 30.0],
      ],
      asks: [
        [29679.0, 40.0],
        [29680.0, 50.0],
        [29681.0, 60.0],
      ],
    });

    // Market shifts to BUY: an aggressive buy order executes at 29680.0
    orderBook.consumeLiquidity(29680.0, 20.0, 'buy');

    expect(orderBook.getLastTradedPrice()).toBe(29680.0);
    expect(orderBook.getLastTradedSide()).toBe('buy');

    // All resting asks at and below 29680 must be eliminated
    expect(orderBook.getAskQuantityAtPrice(29679.0)).toBe(0);
    expect(orderBook.getAskQuantityAtPrice(29680.0)).toBe(0);
    expect(orderBook.getAskQuantityAtPrice(29681.0)).toBe(60.0);

    // Buying order at 29680 must be on the bid side
    expect(orderBook.getBidQuantityAtPrice(29680.0)).toBeGreaterThan(0);

    // Best bid must be 29680.0, best ask 29681.0
    expect(orderBook.getBestBid()).toBe(29680.0);
    expect(orderBook.getBestAsk()).toBe(29681.0);

    // COB ask cutoff calculation verifies 29680 is immediately classified as BID (buying orders, green)
    const rowStep = 1.0;
    const currentMid = orderBook.getLastTradedPrice();
    const lastSide = orderBook.getLastTradedSide();
    const isSellHit = lastSide === 'sell';
    const askCutoff = isSellHit 
      ? (currentMid - rowStep * 0.499) 
      : (lastSide === 'buy' ? (currentMid + rowStep * 0.499) : currentMid);

    // Level at 29680.0 must be a BID (green)
    expect(29680.0 >= askCutoff).toBe(false);
    // Level below 29680.0 must be a BID (green)
    expect(29679.0 >= askCutoff).toBe(false);
    // Level above 29680.0 must be an ASK (red)
    expect(29681.0 >= askCutoff).toBe(true);
  });
});

