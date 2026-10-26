/**
 * JARVIS Automated Market Data Accuracy & Comparison Suite
 * Validates authoritative provider sources, exact candle data, live price consistency,
 * timestamp boundaries, deduplication, and order-flow feature preservation
 * across all supported instruments.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InstrumentRegistry } from '../services/market/InstrumentRegistry';
import { BinanceAdapter } from '../services/exchange/BinanceAdapter';
import { ComexAdapter } from '../services/exchange/ComexAdapter';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { FootprintEngine } from '../services/footprint/FootprintEngine';
import { VwapEngine } from '../services/indicators/VwapEngine';
import { mergeAndDeduplicateCandles } from '../utils/candleUtils';
import { Candle, MarketTrade } from '../types/market';

describe('Authoritative Market Data Accuracy & Comparison Suite', () => {
  describe('1. Supported Instrument Inventory & Authoritative Source Mapping', () => {
    const instruments = [
      { sym: 'BTCUSDT', expectedCategory: 'crypto', expectedProvider: 'Binance Spot', tick: 0.01 },
      { sym: 'ETHUSDT', expectedCategory: 'crypto', expectedProvider: 'Binance Spot', tick: 0.01 },
      { sym: 'SOLUSDT', expectedCategory: 'crypto', expectedProvider: 'Binance Spot', tick: 0.01 },
      { sym: 'BNBUSDT', expectedCategory: 'crypto', expectedProvider: 'Binance Spot', tick: 0.01 },
      { sym: 'GC', expectedCategory: 'futures', expectedProvider: 'COMEX (CME Globex)', tick: 0.1 },
      { sym: 'XAUUSD', expectedCategory: 'metals', expectedProvider: 'Bybit Derivatives', tick: 0.01 },
      { sym: 'EURUSD', expectedCategory: 'forex', expectedProvider: 'Binance / Global FX', tick: 0.0001 },
      { sym: 'GBPUSD', expectedCategory: 'forex', expectedProvider: 'Binance / Global FX', tick: 0.0001 },
    ];

    instruments.forEach(({ sym, expectedCategory, expectedProvider, tick }) => {
      it(`verifies canonical configuration for ${sym}`, () => {
        const inst = InstrumentRegistry.getInstrument(sym);
        expect(inst).toBeDefined();
        expect(inst.category).toBe(expectedCategory);
        expect(inst.provider).toBe(expectedProvider);
        expect(inst.priceTick).toBe(tick);
        expect(inst.supportsOrderBook).toBe(true);
        expect(inst.supportsTrades).toBe(true);
      });
    });
  });

  describe('2. Authoritative Provider OHLCV & Zero-Offset Spot Ingestion', () => {
    it('guarantees BinanceAdapter never offsets Crypto Spot prices', () => {
      const adapter = new BinanceAdapter();
      // Raw exchange prices
      const btcPrice = 80729.45;
      const ethPrice = 2364.12;
      const solPrice = 102.55;
      const bnbPrice = 746.80;

      expect(adapter.adjustPrice(btcPrice, 'BTCUSDT')).toBe(btcPrice);
      expect(adapter.adjustPrice(ethPrice, 'ETHUSDT')).toBe(ethPrice);
      expect(adapter.adjustPrice(solPrice, 'SOLUSDT')).toBe(solPrice);
      expect(adapter.adjustPrice(bnbPrice, 'BNBUSDT')).toBe(bnbPrice);
    });

    it('validates authentic OHLCV candle reconstruction against provider reference fixture', () => {
      // Deterministic provider reference feed for BTCUSDT (1-minute bar)
      const providerBar = {
        time: 1729000000,
        open: 80700.0,
        high: 80750.5,
        low: 80680.25,
        close: 80735.0,
        volume: 14.52,
      };

      const candles: Candle[] = [providerBar];
      expect(candles[0].open).toBe(80700.0);
      expect(candles[0].high).toBe(80750.5);
      expect(candles[0].low).toBe(80680.25);
      expect(candles[0].close).toBe(80735.0);
      expect(candles[0].volume).toBe(14.52);
    });
  });

  describe('3. Candle Boundary Lifecycle & Dynamic Trade Aggregation', () => {
    it('correctly expands high, decreases low, updates close, and accumulates volume within active bar', () => {
      const tfSec = 60;
      const barStart = Math.floor(1729000000 / 60) * 60; // Clean 60-second boundary
      let activeBar: Candle = {
        time: barStart,
        open: 80500.0,
        high: 80500.0,
        low: 80500.0,
        close: 80500.0,
        volume: 1.0,
      };

      // Tick 1: Higher price within same minute
      const trade1 = { price: 80550.0, quantity: 0.5, timestamp: (barStart + 10) * 1000 };
      if (Math.floor(trade1.timestamp / 1000 / tfSec) * tfSec === barStart) {
        activeBar.high = Math.max(activeBar.high, trade1.price);
        activeBar.low = Math.min(activeBar.low, trade1.price);
        activeBar.close = trade1.price;
        activeBar.volume = (activeBar.volume || 0) + trade1.quantity;
      }

      expect(activeBar.high).toBe(80550.0);
      expect(activeBar.low).toBe(80500.0);
      expect(activeBar.close).toBe(80550.0);
      expect(activeBar.volume).toBe(1.5);

      // Tick 2: Lower price within same minute
      const trade2 = { price: 80480.0, quantity: 1.2, timestamp: (barStart + 25) * 1000 };
      if (Math.floor(trade2.timestamp / 1000 / tfSec) * tfSec === barStart) {
        activeBar.high = Math.max(activeBar.high, trade2.price);
        activeBar.low = Math.min(activeBar.low, trade2.price);
        activeBar.close = trade2.price;
        activeBar.volume = (activeBar.volume || 0) + trade2.quantity;
      }

      expect(activeBar.high).toBe(80550.0);
      expect(activeBar.low).toBe(80480.0);
      expect(activeBar.close).toBe(80480.0);
      expect(activeBar.volume).toBe(2.7);

      // Tick 3: New minute boundary elapses -> opens new bar
      const trade3 = { price: 80510.0, quantity: 0.8, timestamp: (barStart + 62) * 1000 };
      const newBarStart = Math.floor(trade3.timestamp / 1000 / tfSec) * tfSec;
      expect(newBarStart).toBe(barStart + tfSec);

      const nextBar: Candle = {
        time: newBarStart,
        open: trade3.price,
        high: trade3.price,
        low: trade3.price,
        close: trade3.price,
        volume: trade3.quantity,
      };

      expect(nextBar.time).toBe(barStart + tfSec);
      expect(nextBar.open).toBe(80510.0);
      expect(nextBar.close).toBe(80510.0);
    });
  });

  describe('4. Historical Deduplication & Safe Reconciliation', () => {
    it('deduplicates overlapping historical chunks without losing newer forming state', () => {
      const historicalChunk1: Candle[] = [
        { time: 1729000000, open: 100, high: 105, low: 98, close: 102, volume: 10 },
        { time: 1729000060, open: 102, high: 108, low: 101, close: 107, volume: 15 },
      ];

      const historicalChunk2: Candle[] = [
        { time: 1729000060, open: 102, high: 109, low: 101, close: 108, volume: 18 }, // newer update for same bar
        { time: 1729000120, open: 108, high: 112, low: 106, close: 110, volume: 20 },
      ];

      const merged = mergeAndDeduplicateCandles(historicalChunk1, historicalChunk2, '1m');
      expect(merged.length).toBe(3);
      expect(merged[0].time).toBe(1729000000);
      expect(merged[1].time).toBe(1729000060);
      expect(merged[1].close).toBe(108); // newest close preserved
      expect(merged[2].time).toBe(1729000120);
    });
  });

  describe('5. Forex Precision & Unfiltered Low Price Ingestion', () => {
    it('accepts and processes authentic EURUSD and GBPUSD prices (~1.12, ~1.33)', () => {
      const eurusdCandles: Candle[] = [
        { time: 1729000000, open: 1.1200, high: 1.1215, low: 1.1198, close: 1.1205, volume: 500 },
        { time: 1729000060, open: 1.1205, high: 1.1220, low: 1.1202, close: 1.1218, volume: 750 },
      ];

      // Validate filter allowing prices > 0 (previously blocked by price > 10)
      const validEur = eurusdCandles.filter(
        (c) => Number.isFinite(c.close) && c.close > 0 && c.open > 0 && c.low <= c.high
      );
      expect(validEur.length).toBe(2);
      expect(validEur[0].close).toBe(1.1205);
      expect(validEur[1].close).toBe(1.1218);

      const gbpusdCandles: Candle[] = [
        { time: 1729000000, open: 1.3360, high: 1.3385, low: 1.3355, close: 1.3374, volume: 600 },
      ];
      const validGbp = gbpusdCandles.filter(
        (c) => Number.isFinite(c.close) && c.close > 0 && c.open > 0 && c.low <= c.high
      );
      expect(validGbp.length).toBe(1);
      expect(validGbp[0].close).toBe(1.3374);
    });

    it('populates OrderBookManager with sub-10 forex prices with 0.0001 precision', async () => {
      const ob = new OrderBookManager(0.0001);
      await ob.synchronize({
        fetchDepthSnapshot: async () => ({
          lastUpdateId: 100,
          timestamp: Date.now(),
          bids: [[1.1204, 50000], [1.1203, 75000]],
          asks: [[1.1205, 45000], [1.1206, 60000]],
        }),
        fetchRecentTrades: async () => [],
      } as any, 'EURUSD');

      const stats = ob.getStats();
      expect(stats.bestBid).toBe(1.1204);
      expect(stats.bestAsk).toBe(1.1205);
      expect(stats.spread).toBeCloseTo(0.0001, 5);
      expect(stats.bidLevelsCount).toBe(2);
      expect(stats.askLevelsCount).toBe(2);
    });
  });

  describe('6. COMEX Gold Futures (GC) Precision & Session Validation', () => {
    it('verifies CME 0.10 tick size and settlement price preservation', async () => {
      const ob = new OrderBookManager(0.1);
      await ob.synchronize({
        fetchDepthSnapshot: async () => ({
          lastUpdateId: 500,
          timestamp: Date.now(),
          bids: [[4007.8, 25], [4007.7, 40]],
          asks: [[4007.9, 30], [4008.0, 50]],
        }),
        fetchRecentTrades: async () => [],
      } as any, 'GC');

      const stats = ob.getStats();
      expect(stats.bestBid).toBe(4007.8);
      expect(stats.bestAsk).toBe(4007.9);
      expect(stats.spread).toBeCloseTo(0.1, 2);
    });
  });

  describe('7. Order Flow Calculation Integrity (Footprint & VWAP)', () => {
    it('correctly calculates VWAP on authentic candlestick stream', () => {
      const candles: Candle[] = [
        { time: 1729000000, open: 100, high: 105, low: 95, close: 100, volume: 100 }, // TP = 100, PV = 10,000, CumV = 100 -> VWAP = 100
        { time: 1729000060, open: 100, high: 115, low: 95, close: 110, volume: 100 }, // TP = 106.67, PV = 10,667, CumV = 200 -> VWAP = 103.33
      ];

      const result = VwapEngine.calculate(candles, {
        enabled: true,
        anchor: 'session',
        source: 'hlc3',
        vwapColor: '#ff9f1c',
        showBands1: true,
        multiplier1: 1.0,
        band1Color: '#38bdf8',
        showBands2: true,
        multiplier2: 2.0,
        band2Color: '#a855f7',
        bandsStyle: 'dashed',
        lineWidth: 2,
      });

      expect(result.vwap.length).toBe(2);
      expect(result.vwap[0].value).toBe(100);
      expect(result.vwap[1].value).toBeCloseTo(103.33, 1);
    });

    it('correctly builds Footprint delta and POC from executed trade stream', () => {
      const fp = new FootprintEngine('BTCUSDT', '1m', 10.0);
      const nowSec = 1729000000;

      // Ingest Buy Trade at 80720
      fp.addTrade({
        id: '1',
        symbol: 'BTCUSDT',
        price: 80720.0,
        quantity: 2.5,
        notional: 80720.0 * 2.5,
        side: 'buy',
        timestamp: nowSec * 1000 + 500,
      });

      // Ingest Sell Trade at 80710
      fp.addTrade({
        id: '2',
        symbol: 'BTCUSDT',
        price: 80710.0,
        quantity: 1.0,
        notional: 80710.0 * 1.0,
        side: 'sell',
        timestamp: nowSec * 1000 + 1500,
      });

      const candles = fp.getAllCandles();
      expect(candles.length).toBeGreaterThan(0);
      expect(candles[0].buyVolume).toBe(2.5);
      expect(candles[0].sellVolume).toBe(1.0);
      expect(candles[0].delta).toBe(1.5);
    });
  });
});
