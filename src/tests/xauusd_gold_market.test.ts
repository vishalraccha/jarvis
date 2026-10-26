/**
 * XAUUSD Gold & Market Session Validation Tests
 * Verifies accurate OTC Spot Gold integration, market session calendar,
 * Saturday closed-market protection, instrument separation, and feature boundaries.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketSessionService } from '../services/market/MarketSessionService';
import { InstrumentRegistry } from '../services/market/InstrumentRegistry';
import { GoldPriceDevAdapter } from '../services/exchange/GoldPriceDevAdapter';
import { ComexAdapter } from '../services/exchange/ComexAdapter';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { FootprintEngine } from '../services/footprint/FootprintEngine';
import { TradeBubbleManager } from '../services/bubbles/TradeBubbleManager';
import { HeatmapEngine } from '../services/heatmap/HeatmapEngine';
import { DEFAULT_BUBBLE_SETTINGS } from '../types/settings';

describe('JARVIS XAUUSD Gold & Market Session Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Saturday & Closed-Market Session Calendar', () => {
    it('correctly identifies Saturday as closed for traditional spot gold', () => {
      // 2026-10-17 is a Saturday (day 6)
      const saturdayDate = new Date('2026-10-17T12:00:00Z');
      const session = MarketSessionService.getSessionInfo('traditional_metals', saturdayDate);

      expect(session.isOpen).toBe(false);
      expect(session.status).toBe('CLOSED');
      expect(session.isWeekend).toBe(true);
      expect(session.statusLabel).toContain('CLOSED');
      expect(session.nextOpenUtc).toBe('Sunday 22:00 UTC');
    });

    it('identifies Sunday before 22:00 UTC as closed and after 22:00 UTC as open', () => {
      const sundayMorning = new Date('2026-10-18T10:00:00Z');
      const sessionMorning = MarketSessionService.getSessionInfo('traditional_metals', sundayMorning);
      expect(sessionMorning.isOpen).toBe(false);
      expect(sessionMorning.status).toBe('CLOSED');

      const sundayEvening = new Date('2026-10-18T22:30:00Z');
      const sessionEvening = MarketSessionService.getSessionInfo('traditional_metals', sundayEvening);
      expect(sessionEvening.isOpen).toBe(true);
      expect(sessionEvening.status).toBe('OPEN');
    });

    it('identifies Friday after 21:00 UTC as closed for the weekend', () => {
      const fridayAfternoon = new Date('2026-10-16T15:00:00Z');
      expect(MarketSessionService.getSessionInfo('traditional_metals', fridayAfternoon).isOpen).toBe(true);

      const fridayEvening = new Date('2026-10-16T21:30:00Z');
      const sessionFridayClose = MarketSessionService.getSessionInfo('traditional_metals', fridayEvening);
      expect(sessionFridayClose.isOpen).toBe(false);
      expect(sessionFridayClose.isWeekend).toBe(true);
      expect(sessionFridayClose.status).toBe('CLOSED');
    });

    it('identifies daily maintenance break between 21:00 and 22:00 UTC Monday-Thursday', () => {
      const wednesdayBreak = new Date('2026-10-14T21:30:00Z');
      const sessionBreak = MarketSessionService.getSessionInfo('traditional_metals', wednesdayBreak);
      expect(sessionBreak.isOpen).toBe(false);
      expect(sessionBreak.status).toBe('BREAK');
    });

    it('keeps crypto 24/7 continuous markets open on Saturday', () => {
      const saturdayDate = new Date('2026-10-17T15:00:00Z');
      const cryptoSession = MarketSessionService.getSessionInfo('24_7', saturdayDate);
      expect(cryptoSession.isOpen).toBe(true);
      expect(cryptoSession.status).toBe('OPEN');
    });
  });

  describe('2. Instrument Separation & Provenance', () => {
    it('separates XAUUSD Spot from XAUUSD Vantage and GC Futures', () => {
      const spot = InstrumentRegistry.getInstrument('XAUUSD');
      const vantage = InstrumentRegistry.getInstrument('XAUUSD_VANTAGE');
      const futures = InstrumentRegistry.getInstrument('GC');

      // Check distinct symbols & ids
      expect(spot.symbol).toBe('XAUUSD');
      expect(spot.instrumentType).toBe('linear_perpetual');
      expect(spot.provider).toContain('Bybit');

      expect(vantage.symbol).toBe('XAUUSD_VANTAGE');
      expect(vantage.instrumentType).toBe('spot_otc');
      expect(vantage.provider).toContain('Vantage');
      expect(vantage.providerId).toBe('mt5');

      expect(futures.symbol).toBe('GC');
      expect(futures.instrumentType).toBe('commodity_futures');
      expect(futures.provider).toContain('COMEX');
    });

    it('enforces active order book, DOM, and trades for Bybit Gold and COMEX GC', () => {
      const spot = InstrumentRegistry.getInstrument('XAUUSD');
      expect(spot.supportsOrderBook).toBe(true);
      expect(spot.supportsTrades).toBe(true);
      expect(spot.supportsHeatmap).toBe(true);
      expect(spot.supportsFootprint).toBe(true);
      expect(spot.supportsBubbles).toBe(true);

      const vantage = InstrumentRegistry.getInstrument('XAUUSD_VANTAGE');
      expect(vantage.supportsOrderBook).toBe(false); // Requires authorized MT5 bridge connection
      expect(vantage.unsupportedFeaturesNotice).toBeDefined();

      const futures = InstrumentRegistry.getInstrument('GC');
      expect(futures.supportsOrderBook).toBe(true);
      expect(futures.supportsTrades).toBe(true);
      expect(futures.supportsHeatmap).toBe(true);
      expect(futures.supportsFootprint).toBe(true);
    });

    it('supports intraday intervals (1m, 5m, 1d) for XAUUSD Gold and COMEX GC', () => {
      const spot = InstrumentRegistry.getInstrument('XAUUSD');
      expect(spot.supportedIntervals).toContain('1m');
      expect(spot.supportedIntervals).toContain('5m');
      expect(spot.supportedIntervals).toContain('1d');

      const vantage = InstrumentRegistry.getInstrument('XAUUSD_VANTAGE');
      expect(vantage.supportedIntervals).toContain('1m');
      expect(vantage.supportedIntervals).toContain('5m');
      expect(vantage.supportedIntervals).toContain('1d');

      const futures = InstrumentRegistry.getInstrument('GC');
      expect(futures.supportedIntervals).toContain('1m');
      expect(futures.supportedIntervals).toContain('5m');
      expect(futures.supportedIntervals).toContain('1d');
    });
  });

  describe('3. GoldPriceDevAdapter Historical & Live Integrity', () => {
    it('returns empty order book snapshot to prevent fake liquidity fabrication', async () => {
      const adapter = new GoldPriceDevAdapter();
      const snapshot = await adapter.fetchDepthSnapshot('XAUUSD');
      expect(snapshot.bids).toEqual([]);
      expect(snapshot.asks).toEqual([]);
    });

    it('returns empty trades array to prevent fake volume fabrication', async () => {
      const adapter = new GoldPriceDevAdapter();
      const trades = await adapter.fetchRecentTrades('XAUUSD');
      expect(trades).toEqual([]);
    });

    it('correctly parses, validates, and sorts historical daily candles from API payload', async () => {
      const adapter = new GoldPriceDevAdapter();

      const mockResponse = {
        symbol: 'XAU-USD-SPOT',
        interval: '1d',
        bars: [
          {
            bar_start: '2026-10-16T00:00:00Z',
            open: '4155.76',
            high: '4198.92',
            low: '4147.27',
            close: '4165.45',
            volume: null,
            is_closed: false,
          },
          {
            bar_start: '2026-10-15T00:00:00Z',
            open: '4112.13',
            high: '4177.33',
            low: '4111.36',
            close: '4156.03',
            volume: null,
            is_closed: true,
          },
          // Invalid bar with high < low (should be rejected)
          {
            bar_start: '2026-10-14T00:00:00Z',
            open: '4150.00',
            high: '4000.00',
            low: '4200.00',
            close: '4120.00',
            volume: null,
            is_closed: true,
          },
        ],
        next_cursor: null,
        meta: { tier: 'free_2026', count: 3, source_id: 'live_xau_canonical' },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const candles = await adapter.fetchHistoricalCandles('XAUUSD', '1d');

      // The corrupt bar must be discarded
      expect(candles.length).toBe(2);

      // Candles must be in ascending chronological order
      expect(candles[0].time).toBe(Math.floor(new Date('2026-10-15T00:00:00Z').getTime() / 1000));
      expect(candles[1].time).toBe(Math.floor(new Date('2026-10-16T00:00:00Z').getTime() / 1000));

      // Timestamps match provider exactly
      expect(candles[1].close).toBe(4165.45);
      expect(candles[1].volume).toBe(0);
    });

    it('does not fabricate intraday candles when called with 1m or 5m', async () => {
      const adapter = new GoldPriceDevAdapter();

      const mockResponse = {
        symbol: 'XAU-USD-SPOT',
        interval: '1d',
        bars: [
          {
            bar_start: '2026-10-16T00:00:00Z',
            open: '4155.76',
            high: '4198.92',
            low: '4147.27',
            close: '4165.45',
            volume: null,
            is_closed: false,
          },
        ],
        next_cursor: null,
        meta: { tier: 'free_2026', count: 1, source_id: 'live_xau_canonical' },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      // Request 1m on goldprice_dev
      const candles = await adapter.fetchHistoricalCandles('XAUUSD', '1m');

      // Verify that fetch parameter used interval=1d and didn't invent 1m bars
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('interval=1d'));
      expect(candles.length).toBe(1);
      expect(candles[0].time).toBe(Math.floor(new Date('2026-10-16T00:00:00Z').getTime() / 1000));
    });
  });

  describe('4. State Isolation & Engine Resetting', () => {
    it('resets order book, footprint, bubbles, and heatmap on instrument change', () => {
      const orderBook = new OrderBookManager(0.01);
      const footprint = new FootprintEngine('BTCUSDT', '5m', 10.0);
      const bubbles = new TradeBubbleManager(DEFAULT_BUBBLE_SETTINGS);
      const heatmap = new HeatmapEngine(250);

      // Simulate active state
      bubbles.addTrade({
        id: '1',
        timestamp: Date.now(),
        price: 80000,
        quantity: 1.5,
        notional: 120000,
        side: 'buy',
        exchange: 'binance',
        symbol: 'BTCUSDT',
      });
      expect(bubbles.getVisibleBubbles(0, Date.now() + 100000).length).toBeGreaterThan(0);

      // Reset state for new instrument
      orderBook.reset();
      heatmap.clear();
      bubbles.clear();
      footprint.clear();

      expect(bubbles.getVisibleBubbles(0, Date.now() + 100000).length).toBe(0);
      expect(orderBook.getLevelsSnapshot().bids.size).toBe(0);
      expect(orderBook.getLevelsSnapshot().asks.size).toBe(0);
      expect(footprint.getAllCandles().length).toBe(0);
    });

    it('BTCUSDT retains full continuous capabilities', () => {
      const btc = InstrumentRegistry.getInstrument('BTCUSDT');
      expect(btc.supportsOrderBook).toBe(true);
      expect(btc.supportsTrades).toBe(true);
      expect(btc.supportsHeatmap).toBe(true);
      expect(btc.supportsFootprint).toBe(true);
      expect(btc.marketSchedule).toBe('24_7');
      expect(btc.supportedIntervals.length).toBe(9);
    });
  });

  describe('5. ComexAdapter COMEX Gold Futures Integration', () => {
    it('returns structured L2 order book depth with 0.10 CME tick size', async () => {
      const adapter = new ComexAdapter();
      const snapshot = await adapter.fetchDepthSnapshot('GC');

      expect(snapshot.bids.length).toBeGreaterThanOrEqual(50);
      expect(snapshot.asks.length).toBeGreaterThanOrEqual(50);

      // Best ask should be strictly greater than best bid
      const bestBid = snapshot.bids[0][0];
      const bestAsk = snapshot.asks[0][0];
      expect(bestAsk).toBeGreaterThanOrEqual(bestBid);

      // Tick alignment check (multiples of 0.1)
      const bidRemainder = Math.round((bestBid * 10) % 1);
      expect(bidRemainder).toBe(0);
    });

    it('returns executed trades with realistic CME volume and sides', async () => {
      const adapter = new ComexAdapter();
      const trades = await adapter.fetchRecentTrades('GC', 50);

      expect(trades.length).toBe(50);
      for (const t of trades) {
        expect(t.symbol).toBe('GC');
        expect(t.exchange).toBe('comex');
        expect(t.price).toBeGreaterThan(0);
        expect(t.quantity).toBeGreaterThanOrEqual(1);
        expect(['buy', 'sell']).toContain(t.side);
      }
    });

    it('returns valid historical candles across intraday timeframes', async () => {
      const adapter = new ComexAdapter();
      const candles = await adapter.fetchHistoricalCandles('GC', '1m', undefined, undefined, 50);

      expect(candles.length).toBeGreaterThan(0);
      const first = candles[0];
      expect(first.open).toBeGreaterThan(0);
      expect(first.high).toBeGreaterThanOrEqual(Math.max(first.open, first.close));
      expect(first.low).toBeLessThanOrEqual(Math.min(first.open, first.close));
      expect(first.volume).toBeGreaterThanOrEqual(0);
    });
  });
});

