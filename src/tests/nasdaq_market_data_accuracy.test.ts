import { describe, expect, it } from 'vitest';
import { InstrumentRegistry } from '../services/market/InstrumentRegistry';
import { BinanceAdapter } from '../services/exchange/BinanceAdapter';
import { getSymbolDefaultFootprintTick } from '../services/footprint/FootprintEngine';

describe('Nasdaq 100 (NAS100) Market Data Integrity & Authenticity Suite', () => {
  it('1. Correctly resolves NAS100 instrument and aliases in InstrumentRegistry', () => {
    const aliases = ['NAS100', 'NASDAQ', 'NDX', 'US100', 'NAS'];
    for (const alias of aliases) {
      const inst = InstrumentRegistry.getInstrument(alias);
      expect(inst).toBeDefined();
      expect(inst.id).toBe('NAS100');
      expect(inst.symbol).toBe('NAS100');
      expect(inst.displayName).toContain('Nasdaq 100 Index');
      expect(inst.typeLabel).toBe('Index CFD');
      expect(inst.provider).toBe('TradingView Benchmark');
      expect(inst.priceTick).toBe(0.1);
      expect(inst.supportsOrderBook).toBe(true);
      expect(inst.supportsTrades).toBe(true);
      expect(inst.supportsHeatmap).toBe(true);
      expect(inst.supportsFootprint).toBe(true);
      expect(inst.supportsBubbles).toBe(true);
      expect(inst.supportedIntervals).toContain('1m');
      expect(inst.supportedIntervals).toContain('5m');
      expect(inst.supportedIntervals).toContain('1h');
      expect(inst.supportedIntervals).toContain('1d');
    }
  });

  it('2. BinanceAdapter identifies NAS100 and returns authoritative symbol metadata', async () => {
    const adapter = new BinanceAdapter();
    expect(adapter.isNasdaq('NAS100')).toBe(true);
    expect(adapter.isNasdaq('NASDAQ')).toBe(true);
    expect(adapter.isNasdaq('NDX')).toBe(true);
    expect(adapter.isNasdaq('US100')).toBe(true);
    expect(adapter.isNasdaq('BTCUSDT')).toBe(false);
    expect(adapter.isNasdaq('XAUUSD')).toBe(false);

    const info = await adapter.getSymbolInfo('NAS100');
    expect(info.id).toBe('NAS100');
    expect(info.symbol).toBe('NAS100');
    expect(info.baseAsset).toBe('NAS100');
    expect(info.quoteAsset).toBe('USD');
    expect(info.priceTick).toBe(0.1);
    expect(info.lotSize).toBe(0.1);
  });

  it('3. BinanceAdapter provides authentic Level 2 depth snapshot for NAS100', async () => {
    const adapter = new BinanceAdapter();
    const depth = await adapter.fetchDepthSnapshot('NAS100', 20);
    expect(depth).toBeDefined();
    expect(depth.bids.length).toBeGreaterThan(0);
    expect(depth.asks.length).toBeGreaterThan(0);
    expect(depth.bids[0][0]).toBeLessThan(depth.asks[0][0]);
    // Prices are in Nasdaq range (~29,000)
    expect(depth.bids[0][0]).toBeGreaterThan(20000);
    expect(depth.asks[0][0]).toBeGreaterThan(20000);
  });

  it('4. FootprintEngine defines appropriate tick aggregation for NAS100', () => {
    const tick = getSymbolDefaultFootprintTick('NAS100');
    expect(tick).toBe(2.0);
    const ndxTick = getSymbolDefaultFootprintTick('NDX');
    expect(ndxTick).toBe(2.0);
  });

  it('5. Preserves all existing Gold (XAUUSD, GC) and Crypto (BTC, ETH, SOL, BNB) registry indices', () => {
    const gold = InstrumentRegistry.getInstrument('XAUUSD');
    expect(gold.id).toBe('XAUUSD');
    expect(gold.displayName).toContain('OANDA');

    const vantage = InstrumentRegistry.getInstrument('XAUUSD_VANTAGE');
    expect(vantage.id).toBe('XAUUSD_VANTAGE');

    const gc = InstrumentRegistry.getInstrument('GC');
    expect(gc.id).toBe('GC');

    const btc = InstrumentRegistry.getInstrument('BTCUSDT');
    expect(btc.id).toBe('BTCUSDT_SPOT');

    const eth = InstrumentRegistry.getInstrument('ETHUSDT');
    expect(eth.id).toBe('ETHUSDT_SPOT');

    const sol = InstrumentRegistry.getInstrument('SOLUSDT');
    expect(sol.id).toBe('SOLUSDT_SPOT');

    const bnb = InstrumentRegistry.getInstrument('BNBUSDT');
    expect(bnb.id).toBe('BNBUSDT_SPOT');
  });
});
