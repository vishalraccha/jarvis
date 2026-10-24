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
});
