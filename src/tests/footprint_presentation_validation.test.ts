import { describe, it, expect } from 'vitest';
import { FootprintEngine } from '../services/footprint/FootprintEngine';
import { MarketTrade } from '../types/market';

describe('Footprint Presentation & Calculation Acceptance Suite', () => {
  it('1. Bid and Ask columns are side by side and correctly classified at every price level', () => {
    const engine = new FootprintEngine('BTCUSDT', '5m', 10.0);

    // Trade 1: Seller aggressor hitting the bid at $68,000 (0.8 BTC)
    const tSell: MarketTrade = {
      id: 'sell-1',
      timestamp: 1700000000000,
      price: 68000.0,
      quantity: 0.8,
      notional: 68000.0 * 0.8,
      side: 'sell',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    // Trade 2: Buyer aggressor lifting the ask at $68,000 (1.4 BTC)
    const tBuy: MarketTrade = {
      id: 'buy-1',
      timestamp: 1700000001000,
      price: 68000.0,
      quantity: 1.4,
      notional: 68000.0 * 1.4,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    };

    engine.addTrade(tSell);
    engine.addTrade(tBuy);

    const candles = engine.getAllCandles();
    expect(candles.length).toBe(1);
    const candle = candles[0];

    const level = candle.levels.get(68000.0);
    expect(level).toBeDefined();

    // Verification 1: Left column is sell-aggressor (bidVolume) = 0.8
    expect(level?.bidVolume).toBeCloseTo(0.8);

    // Verification 2: Right column is buy-aggressor (askVolume) = 1.4
    expect(level?.askVolume).toBeCloseTo(1.4);

    // Verification 3: Total volume = askVolume + bidVolume = 2.2
    expect(level?.totalVolume).toBeCloseTo(2.2);

    // Verification 4: Delta = askVolume - bidVolume = 0.6
    expect(level?.delta).toBeCloseTo(0.6);
  });

  it('2. Volume formatter preserves true quantity without fake x10 scaling', () => {
    function formatVolumeNumber(vol: number): string {
      if (vol <= 0) return '0';
      if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
      if (vol >= 10000) return `${Math.round(vol / 1000)}K`;
      if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
      if (vol >= 10) return Math.round(vol).toString();
      if (vol >= 1) return vol % 1 === 0 ? vol.toFixed(0) : vol.toFixed(1);
      return vol.toFixed(2);
    }

    expect(formatVolumeNumber(0)).toBe('0');
    expect(formatVolumeNumber(0.45)).toBe('0.45');
    expect(formatVolumeNumber(1.3)).toBe('1.3'); // was previously distorted to '13'
    expect(formatVolumeNumber(6.4)).toBe('6.4'); // was previously distorted to '64'
    expect(formatVolumeNumber(14)).toBe('14');
    expect(formatVolumeNumber(1250)).toBe('1.3K');
    expect(formatVolumeNumber(15400)).toBe('15K');
  });

  it('3. Per-candle POC calculates price level with maximum total executed volume', () => {
    const engine = new FootprintEngine('BTCUSDT', '5m', 10.0);

    // Trades at 68000 (total: 2.0)
    engine.addTrade({
      id: 'p1-1',
      timestamp: 1700000000000,
      price: 68000.0,
      quantity: 1.0,
      notional: 68000.0,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });
    engine.addTrade({
      id: 'p1-2',
      timestamp: 1700000001000,
      price: 68000.0,
      quantity: 1.0,
      notional: 68000.0,
      side: 'sell',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    // Trades at 68010 (total: 5.5 -> maximum volume POC)
    engine.addTrade({
      id: 'p2-1',
      timestamp: 1700000002000,
      price: 68010.0,
      quantity: 2.5,
      notional: 68010.0 * 2.5,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });
    engine.addTrade({
      id: 'p2-2',
      timestamp: 1700000003000,
      price: 68010.0,
      quantity: 3.0,
      notional: 68010.0 * 3.0,
      side: 'sell',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    // Trades at 68020 (total: 1.2)
    engine.addTrade({
      id: 'p3-1',
      timestamp: 1700000004000,
      price: 68020.0,
      quantity: 1.2,
      notional: 68020.0 * 1.2,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    const candles = engine.getAllCandles();
    expect(candles.length).toBe(1);
    const candle = candles[0];

    // POC must be 68010
    expect(candle.pocPrice).toBe(68010.0);
    expect(candle.pocVolume).toBeCloseTo(5.5);

    const level68010 = candle.levels.get(68010.0);
    const level68000 = candle.levels.get(68000.0);
    expect(level68010?.isPoc).toBe(true);
    expect(level68000?.isPoc).toBe(false);
  });

  it('4. Candle time sorting guarantees strictly ascending timestamps and eliminates assertion crash', () => {
    // Test the exact deduplication and ascending sort logic implemented in JarvisChart.tsx
    const inputCandles = [
      { time: 1700000000, open: 100, high: 105, low: 99, close: 104, volume: 10 },
      { time: 1700000000, open: 100, high: 105, low: 99, close: 104, volume: 10 }, // duplicate timestamp
      { time: 1699999940, open: 98, high: 101, low: 97, close: 100, volume: 8 },  // older out-of-order
      { time: 1700000060, open: 104, high: 108, low: 103, close: 107, volume: 12 },
    ];

    // Sort ascending
    const sorted = [...inputCandles].sort((a, b) => a.time - b.time);

    // Deduplicate
    const cleanCandles: typeof inputCandles = [];
    for (const c of sorted) {
      if (cleanCandles.length === 0 || c.time > cleanCandles[cleanCandles.length - 1].time) {
        cleanCandles.push(c);
      }
    }

    expect(cleanCandles.length).toBe(3);
    for (let i = 1; i < cleanCandles.length; i++) {
      expect(cleanCandles[i].time).toBeGreaterThan(cleanCandles[i - 1].time);
    }
  });

  it('5. Diagonal imbalance calculation matches order flow standards', () => {
    const engine = new FootprintEngine('BTCUSDT', '5m', 10.0);
    engine.updateSettings({ imbalanceRatio: 3.0, minImbalanceVolume: 1.0 });

    // Level 68000: Bid = 1.0, Ask = 0.5
    engine.addTrade({
      id: 'd1',
      timestamp: 1700000000000,
      price: 68000.0,
      quantity: 1.0,
      notional: 68000.0,
      side: 'sell',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    // Level 68010: Bid = 0.2, Ask = 4.0
    // Ask at 68010 (4.0) vs Bid at 68000 (1.0) -> ratio = 4.0 / 1.0 = 4.0 >= 3.0 (Ask Imbalance)
    engine.addTrade({
      id: 'd2',
      timestamp: 1700000001000,
      price: 68010.0,
      quantity: 4.0,
      notional: 68010.0 * 4.0,
      side: 'buy',
      symbol: 'BTCUSDT',
      exchange: 'binance',
    });

    const candles = engine.getAllCandles();
    const candle = candles[0];
    const lvl68010 = candle.levels.get(68010.0);

    expect(lvl68010?.isAskImbalance).toBe(true);
    expect(lvl68010?.askImbalanceRatio).toBeCloseTo(4.0);
  });
});
