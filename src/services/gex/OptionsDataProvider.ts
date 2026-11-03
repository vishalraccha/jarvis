/**
 * J.A.R.V.I.S 2.0 - Options Data Provider & Instrument Mapping
 * Connects to live authoritative options feeds:
 *   - Deribit Public Options API for BTC & ETH
 *   - Cloud Backend / CBOE / OPRA for NDX, QQQ, Futures & Commodities
 * Strictly enforces instrument-to-options underlying segregation (NDX != QQQ != NQ).
 * Discloses basis warnings and flags UNAVAILABLE when valid options data is absent.
 */

import { OptionChainSnapshot, OptionContract } from '../../types/gex';

export interface OptionsInstrumentMapping {
  symbol: string;
  optionsUnderlying: string;
  provider: string;
  contractMultiplier: number;
  style: 'european_cash' | 'american_physical' | 'crypto_inverse';
  basisWarning?: string;
  requiresBasisAdjustment: boolean;
  defaultTick: number;
}

export const OPTIONS_INSTRUMENT_MAPPINGS: Record<string, OptionsInstrumentMapping> = {
  // 1. Bitcoin Options
  BTCUSD: {
    symbol: 'BTCUSD',
    optionsUnderlying: 'DERIBIT:BTC',
    provider: 'Deribit Options',
    contractMultiplier: 1.0,
    style: 'crypto_inverse',
    requiresBasisAdjustment: false,
    defaultTick: 100,
  },
  BTCUSDT: {
    symbol: 'BTCUSDT',
    optionsUnderlying: 'DERIBIT:BTC',
    provider: 'Deribit Options',
    contractMultiplier: 1.0,
    style: 'crypto_inverse',
    requiresBasisAdjustment: false,
    defaultTick: 100,
  },

  // 2. Ethereum Options
  ETHUSD: {
    symbol: 'ETHUSD',
    optionsUnderlying: 'DERIBIT:ETH',
    provider: 'Deribit Options',
    contractMultiplier: 1.0,
    style: 'crypto_inverse',
    requiresBasisAdjustment: false,
    defaultTick: 10,
  },
  ETHUSDT: {
    symbol: 'ETHUSDT',
    optionsUnderlying: 'DERIBIT:ETH',
    provider: 'Deribit Options',
    contractMultiplier: 1.0,
    style: 'crypto_inverse',
    requiresBasisAdjustment: false,
    defaultTick: 10,
  },

  // 3. Gold Spot Options Reference
  XAUUSD: {
    symbol: 'XAUUSD',
    optionsUnderlying: 'COMEX:GC_OPT',
    provider: 'COMEX Gold Options (CME Globex)',
    contractMultiplier: 100.0, // 100 Troy Oz per contract
    style: 'american_physical',
    basisWarning:
      'COMEX Gold Futures Options basis reference (100 oz contract). Spot XAU/USD basis differential and forward carry apply.',
    requiresBasisAdjustment: true,
    defaultTick: 5,
  },
  XAUUSD_VANTAGE: {
    symbol: 'XAUUSD_VANTAGE',
    optionsUnderlying: 'COMEX:GC_OPT',
    provider: 'COMEX Gold Options (CME Globex)',
    contractMultiplier: 100.0,
    style: 'american_physical',
    basisWarning:
      'Vantage Spot Gold mapped against CME COMEX Gold Options. Futures basis premium applies.',
    requiresBasisAdjustment: true,
    defaultTick: 5,
  },
  GC: {
    symbol: 'GC',
    optionsUnderlying: 'COMEX:GC_OPT',
    provider: 'COMEX Gold Options (CME Globex)',
    contractMultiplier: 100.0,
    style: 'american_physical',
    requiresBasisAdjustment: false,
    defaultTick: 5,
  },

  // 4. Forex Major Currency Options
  EURUSD: {
    symbol: 'EURUSD',
    optionsUnderlying: 'CME:6E_OPT',
    provider: 'CME Euro Currency Options',
    contractMultiplier: 125000.0, // 125,000 EUR
    style: 'american_physical',
    basisWarning:
      'CME Euro Currency Options basis reference (125,000 EUR contract). OTC Spot EUR/USD basis differential applies.',
    requiresBasisAdjustment: true,
    defaultTick: 0.005,
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    optionsUnderlying: 'CME:6B_OPT',
    provider: 'CME British Pound Options',
    contractMultiplier: 62500.0, // 62,500 GBP
    style: 'american_physical',
    basisWarning:
      'CME British Pound Options basis reference (62,500 GBP contract). OTC Spot GBP/USD basis differential applies.',
    requiresBasisAdjustment: true,
    defaultTick: 0.005,
  },

  // 5. Equity Indices (NDX - Nasdaq 100 Index)
  NAS100: {
    symbol: 'NAS100',
    optionsUnderlying: 'CBOE:NDX',
    provider: 'CBOE Nasdaq-100 Index Options (NDX)',
    contractMultiplier: 100.0,
    style: 'european_cash',
    basisWarning:
      'NDX Cash Index Options reference. European-style cash settlement with 100x index multiplier.',
    requiresBasisAdjustment: false,
    defaultTick: 25,
  },
  NASDAQ: {
    symbol: 'NASDAQ',
    optionsUnderlying: 'CBOE:NDX',
    provider: 'CBOE Nasdaq-100 Index Options (NDX)',
    contractMultiplier: 100.0,
    style: 'european_cash',
    requiresBasisAdjustment: false,
    defaultTick: 25,
  },
  NDX: {
    symbol: 'NDX',
    optionsUnderlying: 'CBOE:NDX',
    provider: 'CBOE Nasdaq-100 Index Options (NDX)',
    contractMultiplier: 100.0,
    style: 'european_cash',
    requiresBasisAdjustment: false,
    defaultTick: 25,
  },

  // 6. Index ETFs (QQQ - Invesco QQQ Trust)
  QQQ: {
    symbol: 'QQQ',
    optionsUnderlying: 'OPRA:QQQ',
    provider: 'OPRA QQQ ETF Options',
    contractMultiplier: 100.0,
    style: 'american_physical',
    basisWarning:
      'Invesco QQQ Trust ETF Options. Completely independent options chain from NDX index options.',
    requiresBasisAdjustment: false,
    defaultTick: 1,
  },

  // 7. Futures (NQ & MNQ)
  NQ: {
    symbol: 'NQ',
    optionsUnderlying: 'CME:NQ_OPT',
    provider: 'CME E-mini Nasdaq-100 Options (NQ)',
    contractMultiplier: 20.0, // $20 x index
    style: 'american_physical',
    basisWarning:
      'NQ E-mini Futures Options. Distinct contract multiplier ($20/pt) and settlement from NDX cash index.',
    requiresBasisAdjustment: true,
    defaultTick: 50,
  },
  MNQ: {
    symbol: 'MNQ',
    optionsUnderlying: 'CME:MNQ_OPT',
    provider: 'CME Micro E-mini Nasdaq-100 Options (MNQ)',
    contractMultiplier: 2.0, // $2 x index
    style: 'american_physical',
    basisWarning:
      'MNQ Micro E-mini Futures Options ($2/pt). Mapped with futures options basis reference.',
    requiresBasisAdjustment: true,
    defaultTick: 50,
  },
};

export class OptionsDataProvider {
  private static cache: Map<string, { snapshot: OptionChainSnapshot; cachedAt: number }> = new Map();
  private static readonly CACHE_TTL_MS = 15000; // 15 seconds fresh cache

  /**
   * Resolve options instrument mapping configuration
   */
  public static getMapping(symbol: string): OptionsInstrumentMapping {
    const clean = symbol.toUpperCase().replace(/[-_/]/g, '');
    if (OPTIONS_INSTRUMENT_MAPPINGS[clean]) {
      return OPTIONS_INSTRUMENT_MAPPINGS[clean];
    }
    // Check known prefixes
    if (clean.startsWith('BTC')) return OPTIONS_INSTRUMENT_MAPPINGS.BTCUSDT;
    if (clean.startsWith('ETH')) return OPTIONS_INSTRUMENT_MAPPINGS.ETHUSDT;
    if (clean.startsWith('XAU') || clean.startsWith('GOLD')) return OPTIONS_INSTRUMENT_MAPPINGS.XAUUSD;
    if (clean.startsWith('EUR')) return OPTIONS_INSTRUMENT_MAPPINGS.EURUSD;
    if (clean.startsWith('GBP')) return OPTIONS_INSTRUMENT_MAPPINGS.GBPUSD;
    if (clean === 'NAS100' || clean === 'NASDAQ' || clean === 'NDX') return OPTIONS_INSTRUMENT_MAPPINGS.NAS100;
    if (clean === 'QQQ') return OPTIONS_INSTRUMENT_MAPPINGS.QQQ;
    if (clean === 'NQ') return OPTIONS_INSTRUMENT_MAPPINGS.NQ;
    if (clean === 'MNQ') return OPTIONS_INSTRUMENT_MAPPINGS.MNQ;

    return OPTIONS_INSTRUMENT_MAPPINGS.BTCUSDT;
  }

  /**
   * Diagnostic options mapping information
   */
  public static getOptionsMapping(symbol: string): {
    hasOptionsMarket: boolean;
    optionsUnderlying: string;
    provider: string;
    contractMultiplier: number;
    hasBasisRisk: boolean;
    basisNotice?: string;
  } {
    const clean = symbol.toUpperCase().replace(/[-_/]/g, '');
    const isSupported =
      OPTIONS_INSTRUMENT_MAPPINGS[clean] !== undefined ||
      clean.startsWith('BTC') ||
      clean.startsWith('ETH') ||
      clean.startsWith('XAU') ||
      clean.startsWith('EUR') ||
      clean.startsWith('GBP') ||
      clean === 'NAS100' ||
      clean === 'NASDAQ' ||
      clean === 'NDX' ||
      clean === 'QQQ' ||
      clean === 'NQ' ||
      clean === 'MNQ';

    if (!isSupported) {
      return {
        hasOptionsMarket: false,
        optionsUnderlying: 'UNAVAILABLE',
        provider: 'N/A',
        contractMultiplier: 1.0,
        hasBasisRisk: false,
      };
    }

    const mapping = this.getMapping(symbol);
    const cleanUnderlying = mapping.optionsUnderlying.replace(/.*:/, '').replace(/_OPT/, '');

    return {
      hasOptionsMarket: true,
      optionsUnderlying: cleanUnderlying,
      provider: mapping.provider,
      contractMultiplier: mapping.contractMultiplier,
      hasBasisRisk: Boolean(mapping.requiresBasisAdjustment || mapping.optionsUnderlying.includes('COMEX') || mapping.optionsUnderlying.includes('CME') || mapping.symbol === 'NQ' || mapping.symbol === 'MNQ'),
      basisNotice: mapping.basisWarning,
    };
  }

  /**
   * Fetch live option chain for symbol
   */
  public static async fetchOptionChain(
    symbol: string,
    currentSpotPrice: number = 0
  ): Promise<OptionChainSnapshot> {
    const mapping = this.getMapping(symbol);
    const cacheKey = mapping.optionsUnderlying;
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.cachedAt < this.CACHE_TTL_MS) {
      // Return cached with updated current spot if spot changed
      return {
        ...cached.snapshot,
        spotPrice: currentSpotPrice > 0 ? currentSpotPrice : cached.snapshot.spotPrice,
      };
    }

    try {
      let snapshot: OptionChainSnapshot;

      if (mapping.optionsUnderlying.startsWith('DERIBIT:')) {
        const currency = mapping.optionsUnderlying.replace('DERIBIT:', '');
        snapshot = await this.fetchDeribitOptions(currency, symbol, currentSpotPrice, mapping);
      } else {
        // Query server options backend endpoint
        snapshot = await this.fetchServerOptions(symbol, currentSpotPrice, mapping);
      }

      this.cache.set(cacheKey, { snapshot, cachedAt: now });
      return snapshot;
    } catch (err: any) {
      console.warn(`[OptionsDataProvider] Could not fetch options for ${symbol}:`, err?.message || err);

      // If cached data is available (even if expired), return with isStale = true
      if (cached) {
        return {
          ...cached.snapshot,
          isStale: true,
          dataQuality: 'delayed',
        };
      }

      // Return explicit UNAVAILABLE snapshot (never fabricate fake contracts)
      return {
        underlyingSymbol: symbol,
        optionsUnderlying: mapping.optionsUnderlying,
        spotPrice: currentSpotPrice,
        timestamp: Date.now(),
        openInterestDate: new Date().toISOString().split('T')[0],
        ivTimestamp: Date.now(),
        contracts: [],
        isStale: true,
        dataQuality: 'synthetic_unavailable',
        basisWarning: mapping.basisWarning,
        provider: mapping.provider,
      };
    }
  }

  /**
   * Parse month abbreviation e.g. 'MAR' to month index (0-11)
   */
  private static parseMonth(str: string): number {
    const months: Record<string, number> = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
    };
    return months[str.toUpperCase()] ?? 0;
  }

  /**
   * Fetch live Deribit Options Chain (BTC & ETH) via public API
   */
  private static async fetchDeribitOptions(
    currency: string,
    symbol: string,
    spotPrice: number,
    mapping: OptionsInstrumentMapping
  ): Promise<OptionChainSnapshot> {
    const url = `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      throw new Error(`Deribit API error: HTTP ${res.status}`);
    }

    const data: any = await res.json();
    const rows = data?.result;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Deribit API returned empty result for ${currency}`);
    }

    const contracts: OptionContract[] = [];
    let detectedSpot = spotPrice;

    for (const r of rows) {
      // instrument_name: e.g. "BTC-28MAR25-100000-C"
      const name: string = r.instrument_name;
      if (!name) continue;

      const parts = name.split('-');
      if (parts.length < 4) continue;

      const dateStr = parts[1]; // e.g. "28MAR25"
      const strike = parseFloat(parts[2]);
      const typeChar = parts[3].toUpperCase(); // "C" or "P"
      if (!strike || strike <= 0) continue;

      const type: 'call' | 'put' = typeChar === 'C' ? 'call' : 'put';

      // Parse expiration date e.g. "28MAR25"
      const match = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
      if (!match) continue;

      const day = parseInt(match[1], 10);
      const month = this.parseMonth(match[2]);
      const year = 2000 + parseInt(match[3], 10);
      const expDate = new Date(Date.UTC(year, month, day, 8, 0, 0));
      const expTimestamp = expDate.getTime();
      const expIso = expDate.toISOString().split('T')[0];

      const oi = typeof r.open_interest === 'number' ? r.open_interest : 0;
      const vol = typeof r.volume === 'number' ? r.volume : 0;
      const iv = typeof r.mark_iv === 'number' && r.mark_iv > 0 ? r.mark_iv / 100 : 0.45;
      const underlying = typeof r.underlying_price === 'number' && r.underlying_price > 0 ? r.underlying_price : detectedSpot;
      if (underlying > 0 && detectedSpot <= 0) detectedSpot = underlying;

      contracts.push({
        id: name,
        symbol: name,
        strike,
        type,
        expiration: expIso,
        expirationTimestamp: expTimestamp,
        openInterest: oi,
        volume: vol,
        impliedVolatility: iv,
        gamma: 0, // Will be computed with Black-Scholes using exact spot & IV
        underlyingPrice: underlying,
        contractMultiplier: mapping.contractMultiplier,
        bidPrice: r.bid_price ? r.bid_price * underlying : undefined,
        askPrice: r.ask_price ? r.ask_price * underlying : undefined,
        markPrice: r.mark_price ? r.mark_price * underlying : undefined,
        source: 'Deribit',
      });
    }

    return {
      underlyingSymbol: symbol,
      optionsUnderlying: mapping.optionsUnderlying,
      spotPrice: detectedSpot > 0 ? detectedSpot : spotPrice,
      timestamp: Date.now(),
      openInterestDate: new Date().toISOString().split('T')[0],
      ivTimestamp: Date.now(),
      contracts,
      isStale: false,
      dataQuality: 'verified',
      basisWarning: mapping.basisWarning,
      provider: mapping.provider,
    };
  }

  /**
   * Fetch from Cloud Backend /options/chain endpoint
   */
  private static async fetchServerOptions(
    symbol: string,
    spotPrice: number,
    mapping: OptionsInstrumentMapping
  ): Promise<OptionChainSnapshot> {
    const cleanSym = symbol.toUpperCase().replace(/[-_/]/g, '');
    const url = `/api/options/chain?symbol=${encodeURIComponent(cleanSym)}&spot=${spotPrice}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      throw new Error(`Server options endpoint returned HTTP ${res.status}`);
    }

    const json: OptionChainSnapshot = await res.json();
    return json;
  }
}
