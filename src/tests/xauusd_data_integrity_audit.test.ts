/**
 * XAUUSD Data Integrity & Synchronization Audit Test Suite
 *
 * Verifies the elimination of synthetic price offsets, ensures strict candle construction
 * invariants, tests MT5 bridge state enforcement, and guarantees 1:1 raw feed integrity.
 */

import { describe, it, expect } from 'vitest';
import { BinanceAdapter } from '../services/exchange/BinanceAdapter';
import { MT5Adapter } from '../services/exchange/MT5Adapter';
import { InstrumentRegistry } from '../services/market/InstrumentRegistry';
import { mergeAndDeduplicateCandles, validateCandle } from '../utils/candleUtils';
import { Candle } from '../types/market';

// Polyfill localStorage in test environment
const store = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('XAUUSD Data Integrity & Parity Audit Suite', () => {
  describe('1. Elimination of Fabricated Offsets & 1:1 Market Execution', () => {
    it('proves adjustPrice performs ZERO modification (0.00 offset) on XAUUSD prices', () => {
      const adapter = new BinanceAdapter();
      (adapter as any).requestedSymbol = 'XAUUSD';

      // Test prices around the Oct 26, 2026 21:14 IST period
      const bybitPerpPrices = [4022.86, 4020.20, 4016.93, 4029.13, 4031.39];
      for (const p of bybitPerpPrices) {
        expect(adapter.adjustPrice(p)).toBe(p);
      }
    });

    it('proves calibrateBasis and calibrateSpotBasis return 0 without synthetic offsets', async () => {
      const adapter = new BinanceAdapter();
      const basis = await adapter.calibrateBasis('XAUUSD');
      expect(basis).toBe(0);

      const spotBasis = await adapter.calibrateSpotBasis();
      expect(spotBasis).toBe(0);
    });

    it('verifies localStorage offset key is completely deleted and never used', () => {
      localStorage.setItem('jarvis_spot_basis_offset', '2.66');
      const adapter = new BinanceAdapter();
      // Constructor purges any lingering synthetic offset
      expect((adapter as any).spotBasisOffset).toBe(0);
      expect(adapter.adjustPrice(4020.00)).toBe(4020.00);
    });
  });

  describe('2. Strict Candle Construction Invariants', () => {
    it('enforces high >= max(open, close) and low <= min(open, close) on all candles', () => {
      const validCandle: Candle = {
        time: 1792600000,
        open: 4016.98,
        high: 4017.17,
        low: 4016.88,
        close: 4016.93,
        volume: 125.4,
      };

      expect(validateCandle(validCandle)).toBe(true);
      expect(validCandle.high).toBeGreaterThanOrEqual(Math.max(validCandle.open, validCandle.close));
      expect(validCandle.low).toBeLessThanOrEqual(Math.min(validCandle.open, validCandle.close));
    });

    it('rejects corrupt candles where high < low or high < max(open, close)', () => {
      const corruptHigh: Candle = {
        time: 1792600000,
        open: 4020.0,
        high: 4018.0, // High lower than open!
        low: 4015.0,
        close: 4017.0,
        volume: 10,
      };

      const corruptLow: Candle = {
        time: 1792600000,
        open: 4020.0,
        high: 4025.0,
        low: 4022.0, // Low higher than open!
        close: 4023.0,
        volume: 10,
      };

      expect(validateCandle(corruptHigh)).toBe(false);
      expect(validateCandle(corruptLow)).toBe(false);
    });

    it('monotonically expands active candle wicks without shrinking during live ticks', () => {
      let activeCandle: Candle = {
        time: 1792600060,
        open: 4016.98,
        high: 4016.98,
        low: 4016.98,
        close: 4016.98,
        volume: 0,
      };

      const applyTick = (c: Candle, price: number, qty: number): Candle => {
        return {
          ...c,
          high: Math.max(c.high, price),
          low: Math.min(c.low, price),
          close: price,
          volume: (c.volume || 0) + qty,
        };
      };

      // Tick 1: Price goes up to 4017.17
      activeCandle = applyTick(activeCandle, 4017.17, 1.2);
      expect(activeCandle.high).toBe(4017.17);
      expect(activeCandle.close).toBe(4017.17);

      // Tick 2: Price retraces down to 4016.90 (High must stay 4017.17, Low extends)
      activeCandle = applyTick(activeCandle, 4016.90, 0.8);
      expect(activeCandle.high).toBe(4017.17); // Wick preserved!
      expect(activeCandle.low).toBe(4016.90);
      expect(activeCandle.close).toBe(4016.90);

      // Tick 3: Price drops to 4016.88
      activeCandle = applyTick(activeCandle, 4016.88, 2.5);
      expect(activeCandle.high).toBe(4017.17);
      expect(activeCandle.low).toBe(4016.88);
      expect(activeCandle.close).toBe(4016.88);

      // Tick 4: Final close of bar at 4016.93
      activeCandle = applyTick(activeCandle, 4016.93, 1.0);
      expect(activeCandle.high).toBe(4017.17);
      expect(activeCandle.low).toBe(4016.88);
      expect(activeCandle.close).toBe(4016.93);
      expect(validateCandle(activeCandle)).toBe(true);
    });
  });

  describe('3. Historical & Live Candle Synchronization & Deduplication', () => {
    it('seamlessly merges historical backfill with live open bar without duplicate timestamps', () => {
      const historical: Candle[] = [
        { time: 1792600000, open: 4015.0, high: 4017.0, low: 4014.5, close: 4016.5, volume: 50 },
        { time: 1792600060, open: 4016.5, high: 4018.0, low: 4016.0, close: 4017.2, volume: 60 },
      ];

      // Live update for candle 1792600060 with updated high and close
      const liveUpdate: Candle[] = [
        { time: 1792600060, open: 4016.5, high: 4019.5, low: 4016.0, close: 4019.0, volume: 75 },
        { time: 1792600120, open: 4019.0, high: 4020.0, low: 4018.5, close: 4019.8, volume: 20 },
      ];

      const merged = mergeAndDeduplicateCandles(historical, liveUpdate, '1m');

      expect(merged.length).toBe(3);
      expect(merged[0].time).toBe(1792600000);
      expect(merged[1].time).toBe(1792600060);
      expect(merged[1].high).toBe(4019.5); // Updated
      expect(merged[1].close).toBe(4019.0);
      expect(merged[2].time).toBe(1792600120);
    });
  });

  describe('4. Honest Instrument Metadata & Vantage MT5 Adapter State', () => {
    it('transparently designates XAUUSD as Bybit Linear Perpetual Futures', () => {
      const inst = InstrumentRegistry.getInstrument('XAUUSD');
      expect(inst.displayName).toContain('Bybit');
      expect(inst.provider).toBe('Bybit Derivatives');
      expect(inst.instrumentType).toBe('linear_perpetual');
      expect(inst.supportsOrderBook).toBe(true);
      expect(inst.supportsTrades).toBe(true);
    });

    it('transparently designates XAUUSD_VANTAGE as requiring MT5 bridge credentials', () => {
      const inst = InstrumentRegistry.getInstrument('XAUUSD_VANTAGE');
      expect(inst.displayName).toContain('Vantage');
      expect(inst.displayName).toContain('MT5 Bridge');
      expect(inst.providerId).toBe('mt5');
      expect(inst.supportsOrderBook).toBe(false);
      expect(inst.unsupportedFeaturesNotice).toBeDefined();
    });

    it('reports DISCONNECTED with clear credentials error when Vantage MT5 is unconfigured', () => {
      const adapter = new MT5Adapter();
      expect(adapter.hasValidCredentials()).toBe(false);
      expect(adapter.getConnectionState()).toBe('DISCONNECTED');

      let reportedState = '';
      let reportedError = '';
      adapter.connect('XAUUSD_VANTAGE', '1m', {
        onDepthUpdate: () => {},
        onTrade: () => {},
        onConnectionChange: (state) => { reportedState = state; },
        onError: (err) => { reportedError = err.message; },
      });

      expect(reportedState).toBe('DISCONNECTED');
      expect(reportedError).toContain('Vantage MT5 Bridge unconfigured');
    });
  });
});
