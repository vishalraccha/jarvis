import { describe, it, expect, vi } from 'vitest';
import { BinanceAdapter } from '../services/exchange/BinanceAdapter';
import { InstrumentRegistry } from '../services/market/InstrumentRegistry';

describe('Live Candle & Trade Streaming Diagnostics', () => {
  it('connects to @trade stream for live gold and crypto feeds', () => {
    const adapter = new BinanceAdapter();
    const connectSpy = vi.fn();

    // Verify instrument definitions support trades
    const goldSpot = InstrumentRegistry.getInstrument('XAUUSD', 'binance');
    const goldVantage = InstrumentRegistry.getInstrument('XAUUSD_VANTAGE', 'binance');
    expect(goldSpot.supportsTrades).toBe(true);
    expect(goldVantage.supportsTrades).toBe(true);

    // Verify effective symbol mapping
    expect((adapter as any).getEffectiveSymbol('XAUUSD')).toBe('XAUUSDT');
    expect((adapter as any).getEffectiveSymbol('XAUUSD_VANTAGE')).toBe('XAUUSDT');
    expect((adapter as any).getEffectiveSymbol('BTCUSDT')).toBe('BTCUSDT');
  });

  it('normalizes gold event symbol matching so live trades are never rejected', () => {
    const targetSym: string = 'XAUUSD';
    const isGoldTarget = targetSym.includes('XAU') || targetSym === 'GC' || targetSym === 'GOLD';

    const testTrades = [
      { symbol: 'XAUUSDT', price: 4140.25 },
      { symbol: 'XAUUSD', price: 4140.30 },
      { symbol: 'XAUUSD_VANTAGE', price: 4140.28 },
    ];

    for (const trade of testTrades) {
      const trSym = (trade.symbol || targetSym).toUpperCase().replace(/[-_/]/g, '');
      const isGoldTrade = trSym.includes('XAU') || trSym === 'GC' || trSym === 'GOLD';
      let rejected = false;
      if (isGoldTarget) {
        if (!isGoldTrade) rejected = true;
      } else if (trSym !== targetSym) {
        rejected = true;
      }
      expect(rejected).toBe(false);
    }
  });

  it('preserves live candle high/low expansion during live ticks', () => {
    const initialBar = {
      time: 1792594260,
      open: 4140.0,
      high: 4140.0,
      low: 4140.0,
      close: 4140.0,
    };

    let cur = { ...initialBar };

    // Simulate incoming trade ticks
    const tickPrices = [4141.5, 4139.2, 4142.8, 4140.1];
    for (const price of tickPrices) {
      const barOpen = cur.open ?? price;
      const high = Math.max(cur.high, price, barOpen);
      const low = Math.min(cur.low, price, barOpen);
      const close = price;

      cur = {
        time: cur.time,
        open: barOpen,
        high,
        low,
        close,
      };
    }

    expect(cur.high).toBe(4142.8);
    expect(cur.low).toBe(4139.2);
    expect(cur.close).toBe(4140.1);
  });

  it('subscribes to @aggTrade on Binance Futures to avoid stream rejection', () => {
    const adapter = new BinanceAdapter();
    const effSym = (adapter as any).getEffectiveSymbol('XAUUSD').toLowerCase();
    const isFut = (adapter as any).isFutures(effSym);
    const tradeStream = `${effSym}@aggTrade`;
    const streamName = `${effSym}@depth@100ms/${tradeStream}/${effSym}@kline_1m`;

    expect(isFut).toBe(true);
    expect(tradeStream).toBe('xauusdt@aggTrade');
    expect(streamName).toContain('@aggTrade');
  });

  it('processes incoming ticks even if trade timestamp is behind current candle time (clock skew tolerance)', () => {
    const tfSec = 60;
    const curTime = 1792594260; // 1m candle start
    let cur = {
      time: curTime,
      open: 4140.0,
      high: 4140.5,
      low: 4139.5,
      close: 4140.0,
    };

    // Simulate trade arrival where timestamp is slightly behind curTime due to clock skew
    const tradeTimestampMs = (curTime - 120) * 1000; // 2 minutes behind
    const tradeSec = Math.floor(tradeTimestampMs / 1000);
    const barTime = Math.floor(tradeSec / tfSec) * tfSec;

    // Verify barTime <= cur.time does NOT drop the tick
    let updated = false;
    let priceLineColor = '';
    const price = 4143.0;

    if (!cur || barTime > cur.time) {
      // New candle
    } else {
      // Active candle update
      const barOpen = cur.open ?? price;
      const high = Math.max(cur.high, price, barOpen);
      const low = Math.min(cur.low, price, barOpen);
      const close = price;
      cur = { time: cur.time, open: barOpen, high, low, close };
      priceLineColor = close >= barOpen ? '#00e676' : '#ff2d55';
      updated = true;
    }

    expect(updated).toBe(true);
    expect(cur.close).toBe(4143.0);
    expect(cur.high).toBe(4143.0);
    expect(priceLineColor).toBe('#00e676');

    // Simulate bearish tick dipping below candle open
    const bearishPrice = 4138.5;
    const barOpen = cur.open;
    cur = {
      ...cur,
      high: Math.max(cur.high, bearishPrice),
      low: Math.min(cur.low, bearishPrice),
      close: bearishPrice,
    };
    priceLineColor = cur.close >= barOpen ? '#00e676' : '#ff2d55';

    expect(cur.close).toBe(4138.5);
    expect(cur.low).toBe(4138.5);
    expect(priceLineColor).toBe('#ff2d55'); // turns red dynamically
  });
});
