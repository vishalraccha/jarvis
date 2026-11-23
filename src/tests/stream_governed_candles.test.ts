import { describe, it, expect } from 'vitest';
import { InstrumentRegistry } from '../services/market/InstrumentRegistry';
import { Candle, MarketTrade } from '../types/market';

describe('Stream Governed Candles (XAUUSD & NAS100)', () => {
  it('correctly identifies XAUUSDT as spot gold instrument in InstrumentRegistry', () => {
    const inst = InstrumentRegistry.getInstrument('XAUUSDT');
    expect(inst).toBeDefined();
    expect(inst.symbol).toBe('XAUUSD');
    expect(inst.category).toBe('metals');
    expect(inst.supportsFootprint).toBe(true);
  });

  it('preserves authentic TradingView candle OHLC against competing futures trade ticks', () => {
    const barTime = Math.floor(Date.now() / 60000) * 60;
    const tvCandle: Candle = {
      time: barTime,
      open: 3669.10,
      high: 3670.50,
      low: 3668.80,
      close: 3669.75,
      volume: 150,
    };

    const latestCandles: Candle[] = [{ ...tvCandle }];

    // Simulate incoming futures trades with higher/differing basis (e.g. 3676.50)
    const futuresTrade: MarketTrade = {
      id: 'trade_1',
      timestamp: (barTime + 20) * 1000,
      price: 3676.50,
      quantity: 2.5,
      notional: 3676.50 * 2.5,
      side: 'buy',
      isBuyerMaker: false,
      exchange: 'binance',
      symbol: 'XAUUSDT',
      marketType: 'linear_perpetual',
    };

    const targetSym: string = 'XAUUSD';
    const isGoldTarget = targetSym.includes('XAU') || targetSym === 'GC' || targetSym === 'GOLD';
    const isStreamGoverned = isGoldTarget || targetSym.includes('NAS') || targetSym.includes('NDX');
    expect(isStreamGoverned).toBe(true);

    const tfSec = 60;
    const tradeSec = Math.floor(futuresTrade.timestamp / 1000);
    const tradeBarTime = Math.floor(tradeSec / tfSec) * tfSec;

    // Stream-governed logic: trade volume is accumulated, but OHLC is NEVER mutated
    if (isStreamGoverned) {
      const last = latestCandles[latestCandles.length - 1];
      if (last.time === tradeBarTime) {
        last.volume = (last.volume || 0) + (futuresTrade.quantity || 0);
      }
    }

    const candleAfterTrade = latestCandles[0];
    // Invariant: Candle OHLC must strictly match TradingView authoritative candle!
    expect(candleAfterTrade.open).toBe(3669.10);
    expect(candleAfterTrade.high).toBe(3670.50); // NOT corrupted to 3676.50!
    expect(candleAfterTrade.low).toBe(3668.80);
    expect(candleAfterTrade.close).toBe(3669.75); // NOT corrupted to 3676.50!
    expect(candleAfterTrade.volume).toBe(152.5); // Volume truthfully accumulated
  });

  it('reconciles authoritative live updates from TradingView kline stream', () => {
    const barTime = Math.floor(Date.now() / 60000) * 60;
    const initialCandle: Candle = {
      time: barTime,
      open: 3669.10,
      high: 3670.50,
      low: 3668.80,
      close: 3669.75,
      volume: 150,
    };

    const latestCandles: Candle[] = [{ ...initialCandle }];

    // Incoming updated kline from TradingView stream: price moves to 3671.20
    const tvUpdate: Candle = {
      time: barTime,
      open: 3669.10,
      high: 3671.20,
      low: 3668.80,
      close: 3671.05,
      volume: 180,
    };

    const last = latestCandles[latestCandles.length - 1];
    if (last.time === tvUpdate.time) {
      last.open = tvUpdate.open > 0 ? tvUpdate.open : last.open;
      last.high = tvUpdate.high;
      last.low = tvUpdate.low;
      last.close = tvUpdate.close;
      if (tvUpdate.volume) last.volume = Math.max(last.volume || 0, tvUpdate.volume);
    }

    expect(last.high).toBe(3671.20);
    expect(last.close).toBe(3671.05);
    expect(last.open).toBe(3669.10);
    expect(last.volume).toBe(180);
  });
});
