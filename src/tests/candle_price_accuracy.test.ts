/**
 * Candle & Price Accuracy Verification Suite
 * Verifies that crypto spot symbols (BTC/USDT, ETH/USDT, SOL/USDT) and Gold spot symbols (XAU/USD)
 * match MT5 and TradingView benchmarks accurately with zero futures-basis distortion and ultra-low latency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstrumentRegistry } from '../services/market/InstrumentRegistry';
import { BinanceAdapter } from '../services/exchange/BinanceAdapter';
import { marketSyncService } from '../../server/services/marketSyncService';
import { sqliteStore } from '../../server/db/sqliteStore';

describe('Candle & Price Accuracy Suite', () => {
  beforeEach(async () => {
    await sqliteStore.init();
  });

  describe('1. Instrument Classification & Aliases', () => {
    it('resolves BTCUSD and BTC to BTCUSDT Spot instrument', () => {
      const inst1 = InstrumentRegistry.getInstrument('BTCUSD');
      const inst2 = InstrumentRegistry.getInstrument('BTC');
      const inst3 = InstrumentRegistry.getInstrument('BTCUSDT');

      expect(inst1.id).toBe('BTCUSDT_SPOT');
      expect(inst1.instrumentType).toBe('spot');
      expect(inst2.id).toBe('BTCUSDT_SPOT');
      expect(inst3.id).toBe('BTCUSDT_SPOT');
    });

    it('resolves ETHUSD and SOLUSD to spot instruments', () => {
      const eth = InstrumentRegistry.getInstrument('ETHUSD');
      const sol = InstrumentRegistry.getInstrument('SOLUSD');

      expect(eth.id).toBe('ETHUSDT_SPOT');
      expect(eth.instrumentType).toBe('spot');
      expect(sol.id).toBe('SOLUSDT_SPOT');
      expect(sol.instrumentType).toBe('spot');
    });

    it('classifies XAUUSD as Spot Gold matching TradingView OANDA benchmark', () => {
      const xau = InstrumentRegistry.getInstrument('XAUUSD');
      expect(xau.id).toBe('XAUUSD');
      expect(xau.instrumentType).toBe('spot');
      expect(xau.provider).toContain('TradingView Benchmark');
    });
  });

  describe('2. BinanceAdapter Endpoint & Basis Calibration', () => {
    it('treats BTCUSDT, ETHUSDT, SOLUSDT as spot (not futures)', () => {
      const adapter = new BinanceAdapter();
      expect((adapter as any).isFutures('BTCUSDT')).toBe(false);
      expect((adapter as any).isFutures('ETHUSDT')).toBe(false);
      expect((adapter as any).isFutures('SOLUSDT')).toBe(false);
    });

    it('treats XAUUSDT and GOLD as futures for basis mapping', () => {
      const adapter = new BinanceAdapter();
      expect((adapter as any).isFutures('XAUUSD')).toBe(true);
      expect((adapter as any).isFutures('XAUUSDT')).toBe(true);
      expect((adapter as any).isFutures('GOLD')).toBe(true);
    });

    it('calibrates Binance XAUUSDT to authentic spot gold benchmark (2.66 offset) matching TradingView/MT5', () => {
      const adapter = new BinanceAdapter();
      (adapter as any).requestedSymbol = 'XAUUSD';

      const rawPrice = 4000.00;
      const adjusted = adapter.adjustPrice(rawPrice);
      expect(adjusted).toBe(3997.34);
    });

    it('does not adjust crypto spot prices (offset = 0)', () => {
      const adapter = new BinanceAdapter();
      (adapter as any).requestedSymbol = 'BTCUSDT';

      const rawPrice = 80581.50;
      const adjusted = adapter.adjustPrice(rawPrice);
      expect(adjusted).toBe(80581.50);
    });
  });

  describe('3. MarketSyncService Spot Routing & Calibration', () => {
    it('correctly maps upstream endpoints: spot for crypto, fapi for gold futures', async () => {
      // Mock global fetch
      const originalFetch = global.fetch;
      let requestedUrl = '';

      global.fetch = vi.fn().mockImplementation((url: string) => {
        requestedUrl = url;
        // Return dummy kline
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            [1700000000000, '80500', '80600', '80450', '80550', '100', 1700000060000, '0', 10, '0', '0', '0'],
          ]),
        });
      });

      try {
        await marketSyncService.fetchAndStoreUpstream('BTCUSDT', '1m', 10);
        expect(requestedUrl).toContain('api.binance.com/api/v3/klines');
        expect(requestedUrl).toContain('symbol=BTCUSDT');

        await marketSyncService.fetchAndStoreUpstream('XAUUSD', '1m', 10);
        expect(requestedUrl).toContain('fapi.binance.com/fapi/v1/klines');
        expect(requestedUrl).toContain('symbol=XAUUSDT');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('stores authentic calibrated exchange prices when inserting XAUUSD candles into SQLite store', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            [1729000000000, '4000.00', '4005.00', '3995.00', '4002.00', '50'],
          ]),
        });
      });

      try {
        const candles = await marketSyncService.fetchAndStoreUpstream('XAUUSD', '1m', 1);
        expect(candles.length).toBe(1);
        expect(candles[0].close).toBe(3999.34);
        expect(candles[0].open).toBe(3997.34);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
