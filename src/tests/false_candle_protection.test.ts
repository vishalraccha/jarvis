import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { mergeAndDeduplicateCandles } from '../utils/candleUtils';
import { Candle } from '../types/market';

describe('False Candle Protection & Resting Liquidity Preservation', () => {
  let orderBook: OrderBookManager;

  beforeEach(() => {
    orderBook = new OrderBookManager(0.01);
    // Populate an active ETH/USDT order book around 2251
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 100,
      lastUpdateId: 100,
      timestamp: Date.now(),
      bids: [
        [2251.0, 157.0],
        [2250.0, 14.0],
        [2249.0, 13.0],
        [2248.0, 236.0],
        [2240.0, 24.0],
        [2239.0, 125.0], // Deep resting limit liquidity pool
      ],
      asks: [
        [2251.5, 31.0],
        [2252.0, 45.0],
        [2253.0, 64.0],
      ],
    });
  });

  it('1. OrderBookManager rejects consumeLiquidity for aberrant ticks deep in the book', () => {
    expect(orderBook.getBestBid()).toBe(2251.0);
    expect(orderBook.getBestAsk()).toBe(2251.5);

    // Attempt to consume liquidity at 2239 (a resting limit pool 0.53% below best bid)
    orderBook.consumeLiquidity(2239.0, 10.0, 'sell');

    // Best bid must NOT have collapsed to 2239; it must remain at 2251.0!
    expect(orderBook.getBestBid()).toBe(2251.0);
    // The resting orders at 2248 and 2250 must remain intact
    expect(orderBook.getBidQuantityAtPrice(2250.0)).toBe(14.0);
    expect(orderBook.getBidQuantityAtPrice(2248.0)).toBe(236.0);
    expect(orderBook.getBidQuantityAtPrice(2239.0)).toBe(125.0);
  });

  it('2. Legitimate trades near inside spread are processed correctly', () => {
    // Aggressive sell at 2251.0 hits best bid
    orderBook.consumeLiquidity(2251.0, 50.0, 'sell');
    expect(orderBook.getLastTradedPrice()).toBe(2251.0);
    expect(orderBook.getLastTradedSide()).toBe('sell');
  });

  it('3. mergeAndDeduplicateCandles heals false wicks that were corrupted by bad ticks', () => {
    // Suppose a local buffer candle had its low corrupted to 2239.0 due to an anomalous tick
    const corruptedBuffer: Candle[] = [
      {
        time: 1730400000,
        open: 2248.0,
        high: 2252.0,
        low: 2239.0, // Corrupted false wick!
        close: 2251.5,
        volume: 500,
      },
      {
        time: 1730400060,
        open: 2251.5,
        high: 2252.0,
        low: 2251.0,
        close: 2251.8,
        volume: 100,
      },
    ];

    // The authoritative exchange klines from REST API / TradingView has true low 2245.38 for the closed bar
    const authoritativeExchangeCandles: Candle[] = [
      {
        time: 1730400000,
        open: 2248.0,
        high: 2252.0,
        low: 2245.38, // True exchange low (price never touched 2239)
        close: 2251.5,
        volume: 500,
      },
      {
        time: 1730400060,
        open: 2251.5,
        high: 2252.0,
        low: 2251.0,
        close: 2251.8,
        volume: 100,
      },
    ];

    const healed = mergeAndDeduplicateCandles(corruptedBuffer, authoritativeExchangeCandles, '1m');

    expect(healed.length).toBe(2);
    // The false 2239 wick on the closed bar must be healed back to the true exchange low of 2245.38!
    expect(healed[0].low).toBe(2245.38);
    expect(healed[0].open).toBe(2248.0);
    expect(healed[0].close).toBe(2251.5);
  });

  it('4. mergeAndDeduplicateCandles heals corrupted open price from bad previous close', () => {
    // Suppose previous close corruption caused next candle open to start at 2239.0
    const corruptedCandle: Candle[] = [
      {
        time: 1730400060,
        open: 2239.0, // Corrupted open!
        high: 2251.76,
        low: 2239.0,
        close: 2251.76,
        volume: 300,
      },
      {
        time: 1730400120,
        open: 2251.76,
        high: 2252.0,
        low: 2251.0,
        close: 2251.8,
        volume: 100,
      },
    ];

    const authoritativeCandle: Candle[] = [
      {
        time: 1730400060,
        open: 2248.5, // True exchange open
        high: 2251.76,
        low: 2247.9, // True exchange low
        close: 2251.76,
        volume: 300,
      },
      {
        time: 1730400120,
        open: 2251.76,
        high: 2252.0,
        low: 2251.0,
        close: 2251.8,
        volume: 100,
      },
    ];

    const healed = mergeAndDeduplicateCandles(corruptedCandle, authoritativeCandle, '1m');

    expect(healed.length).toBe(2);
    expect(healed[0].open).toBe(2248.5);
    expect(healed[0].low).toBe(2247.9);
    expect(healed[0].close).toBe(2251.76);
  });
});
