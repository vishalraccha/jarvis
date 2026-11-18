/**
 * JARVIS 2.0 Instrument Identity & Multi-Broker Synchronization Specification
 * 
 * Strict specifications for every supported market:
 * - Broker/Exchange
 * - Provider symbol
 * - TradingView official symbol
 * - MT5 Broker symbol
 * - Contract specifications & tick sizes
 * - Comparison module with Discrepancy Detection & Honest Labeling
 * 
 * ZERO-FABRICATION RULE:
 * If an external broker feed (e.g. MT5 or TradingView Pro) requires authorized
 * credentials or is unavailable, clearly report it as unavailable or manual comparison.
 * Never scrape private APIs or inject artificial offsets to force prices to match.
 */

import { ExchangeId } from '../../types/market';
import { MarketSchedule } from './MarketSessionService';
import { MarketType, CandleConstructionMethod } from './CanonicalMarketDataEngine';

export interface ContractSpecification {
  contractMultiplier: number;
  tickSize: number;
  lotSize: number;
  minQuantity: number;
  priceDecimals: number;
  currency: string;
}

export interface InstrumentIdentityConfig {
  id: string;
  jarvisSymbol: string;
  displayName: string;
  category: 'crypto' | 'metals' | 'forex' | 'indices' | 'futures';
  marketType: MarketType;
  brokerOrExchange: string;
  providerId: ExchangeId;
  providerSymbol: string;
  tradingViewSymbol: string;
  mt5BrokerSymbol: string;
  contractSpecs: ContractSpecification;
  marketSchedule: MarketSchedule;
  timezone: 'UTC';
  candleConstruction: CandleConstructionMethod;
  discrepancyTolerances: {
    maxPriceDiffPct: number;
    maxDelaySeconds: number;
  };
  notes: string;
}

export const CANONICAL_INSTRUMENT_IDENTITIES: InstrumentIdentityConfig[] = [
  // 1. BTCUSDT (Binance Spot)
  {
    id: 'BTCUSDT_SPOT',
    jarvisSymbol: 'BTCUSDT',
    displayName: 'BTC/USDT • Binance Spot',
    category: 'crypto',
    marketType: 'spot',
    brokerOrExchange: 'Binance Spot',
    providerId: 'binance',
    providerSymbol: 'BTCUSDT',
    tradingViewSymbol: 'BINANCE:BTCUSDT',
    mt5BrokerSymbol: 'BTCUSD',
    contractSpecs: {
      contractMultiplier: 1,
      tickSize: 0.01,
      lotSize: 0.00001,
      minQuantity: 0.00001,
      priceDecimals: 2,
      currency: 'USDT',
    },
    marketSchedule: '24_7',
    timezone: 'UTC',
    candleConstruction: 'traded_ticks',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.15,
      maxDelaySeconds: 3,
    },
    notes: 'Binance Spot trades against USDT. Differing prices from USD fiat quotes (e.g. MT5 BTCUSD) reflect genuine USDT/USD stablecoin peg dynamics.',
  },

  // 2. ETHUSDT (Binance Spot)
  {
    id: 'ETHUSDT_SPOT',
    jarvisSymbol: 'ETHUSDT',
    displayName: 'ETH/USDT • Binance Spot',
    category: 'crypto',
    marketType: 'spot',
    brokerOrExchange: 'Binance Spot',
    providerId: 'binance',
    providerSymbol: 'ETHUSDT',
    tradingViewSymbol: 'BINANCE:ETHUSDT',
    mt5BrokerSymbol: 'ETHUSD',
    contractSpecs: {
      contractMultiplier: 1,
      tickSize: 0.01,
      lotSize: 0.0001,
      minQuantity: 0.0001,
      priceDecimals: 2,
      currency: 'USDT',
    },
    marketSchedule: '24_7',
    timezone: 'UTC',
    candleConstruction: 'traded_ticks',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.2,
      maxDelaySeconds: 3,
    },
    notes: 'Binance Spot trades against USDT.',
  },

  // 3. SOLUSDT (Binance Spot)
  {
    id: 'SOLUSDT_SPOT',
    jarvisSymbol: 'SOLUSDT',
    displayName: 'SOL/USDT • Binance Spot',
    category: 'crypto',
    marketType: 'spot',
    brokerOrExchange: 'Binance Spot',
    providerId: 'binance',
    providerSymbol: 'SOLUSDT',
    tradingViewSymbol: 'BINANCE:SOLUSDT',
    mt5BrokerSymbol: 'SOLUSD',
    contractSpecs: {
      contractMultiplier: 1,
      tickSize: 0.01,
      lotSize: 0.001,
      minQuantity: 0.001,
      priceDecimals: 2,
      currency: 'USDT',
    },
    marketSchedule: '24_7',
    timezone: 'UTC',
    candleConstruction: 'traded_ticks',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.25,
      maxDelaySeconds: 3,
    },
    notes: 'Binance Spot trades against USDT.',
  },

  // 4. BNBUSDT (Binance Spot)
  {
    id: 'BNBUSDT_SPOT',
    jarvisSymbol: 'BNBUSDT',
    displayName: 'BNB/USDT • Binance Spot',
    category: 'crypto',
    marketType: 'spot',
    brokerOrExchange: 'Binance Spot',
    providerId: 'binance',
    providerSymbol: 'BNBUSDT',
    tradingViewSymbol: 'BINANCE:BNBUSDT',
    mt5BrokerSymbol: 'BNBUSD',
    contractSpecs: {
      contractMultiplier: 1,
      tickSize: 0.01,
      lotSize: 0.001,
      minQuantity: 0.001,
      priceDecimals: 2,
      currency: 'USDT',
    },
    marketSchedule: '24_7',
    timezone: 'UTC',
    candleConstruction: 'traded_ticks',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.25,
      maxDelaySeconds: 3,
    },
    notes: 'Binance Spot trades against USDT.',
  },

  // 5. XAUUSD (Spot Gold OTC CFD)
  {
    id: 'XAUUSD',
    jarvisSymbol: 'XAUUSD',
    displayName: 'XAU/USD • Spot Gold (OANDA / Broker Benchmark)',
    category: 'metals',
    marketType: 'spot',
    brokerOrExchange: 'OANDA / Vantage OTC',
    providerId: 'binance',
    providerSymbol: 'XAUUSDT',
    tradingViewSymbol: 'OANDA:XAUUSD',
    mt5BrokerSymbol: 'XAUUSD',
    contractSpecs: {
      contractMultiplier: 100, // 100 troy oz per lot
      tickSize: 0.01,
      lotSize: 0.01,
      minQuantity: 0.01,
      priceDecimals: 2,
      currency: 'USD',
    },
    marketSchedule: 'traditional_metals',
    timezone: 'UTC',
    candleConstruction: 'traded_ticks',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.12, // ~$3.50 on $3000 gold
      maxDelaySeconds: 4,
    },
    notes: 'Spot Gold is an OTC interbank market. Each broker (OANDA, Vantage, Exness) quotes proprietary bid/ask spreads. Never force with artificial basis subtraction.',
  },

  // 6. GC (COMEX CME Gold Futures Front-Month)
  {
    id: 'GC',
    jarvisSymbol: 'GC',
    displayName: 'GC • COMEX Gold Futures (CME Globex)',
    category: 'futures',
    marketType: 'commodity_futures',
    brokerOrExchange: 'CME Globex',
    providerId: 'comex',
    providerSymbol: 'GC=F',
    tradingViewSymbol: 'COMEX:GC1!',
    mt5BrokerSymbol: 'GOLD_FUT',
    contractSpecs: {
      contractMultiplier: 100, // 100 troy oz contract
      tickSize: 0.1,
      lotSize: 1,
      minQuantity: 1,
      priceDecimals: 1,
      currency: 'USD',
    },
    marketSchedule: 'cme_futures',
    timezone: 'UTC',
    candleConstruction: 'traded_ticks',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.2,
      maxDelaySeconds: 15,
    },
    notes: 'CME Globex front-month futures. Futures trade at a genuine basis (contango/backwardation) to spot gold.',
  },

  // 7. NAS100 (Nasdaq-100 Cash Index CFD)
  {
    id: 'NAS100',
    jarvisSymbol: 'NAS100',
    displayName: 'NAS100 / NDX • Nasdaq 100 Cash Index CFD',
    category: 'indices',
    marketType: 'index_cfd',
    brokerOrExchange: 'Pepperstone / Global CFD',
    providerId: 'binance',
    providerSymbol: '^NDX',
    tradingViewSymbol: 'PEPPERSTONE:NAS100',
    mt5BrokerSymbol: 'NAS100',
    contractSpecs: {
      contractMultiplier: 1,
      tickSize: 0.1,
      lotSize: 0.1,
      minQuantity: 0.1,
      priceDecimals: 1,
      currency: 'USD',
    },
    marketSchedule: 'traditional_metals',
    timezone: 'UTC',
    candleConstruction: 'traded_ticks',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.1,
      maxDelaySeconds: 4,
    },
    notes: 'Index cash benchmark. Distinct from QQQ (ETF) and NQ (CME E-mini futures). Never mix into a single price series.',
  },

  // 8. EURUSD (Spot Forex)
  {
    id: 'EURUSD',
    jarvisSymbol: 'EURUSD',
    displayName: 'EUR/USD • Spot Forex',
    category: 'forex',
    marketType: 'spot_forex',
    brokerOrExchange: 'Global Interbank FX',
    providerId: 'binance',
    providerSymbol: 'EURUSD=X',
    tradingViewSymbol: 'FX:EURUSD',
    mt5BrokerSymbol: 'EURUSD',
    contractSpecs: {
      contractMultiplier: 100000, // 1 standard lot = 100,000 EUR
      tickSize: 0.00001,
      lotSize: 0.01,
      minQuantity: 0.01,
      priceDecimals: 5,
      currency: 'USD',
    },
    marketSchedule: 'traditional_metals',
    timezone: 'UTC',
    candleConstruction: 'bid_ask_midpoint',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.05,
      maxDelaySeconds: 5,
    },
    notes: 'Interbank spot forex quotes. Pips are 0.0001; pipette precision is 0.00001.',
  },

  // 9. GBPUSD (Spot Forex)
  {
    id: 'GBPUSD',
    jarvisSymbol: 'GBPUSD',
    displayName: 'GBP/USD • Spot Forex',
    category: 'forex',
    marketType: 'spot_forex',
    brokerOrExchange: 'Global Interbank FX',
    providerId: 'binance',
    providerSymbol: 'GBPUSD=X',
    tradingViewSymbol: 'FX:GBPUSD',
    mt5BrokerSymbol: 'GBPUSD',
    contractSpecs: {
      contractMultiplier: 100000,
      tickSize: 0.00001,
      lotSize: 0.01,
      minQuantity: 0.01,
      priceDecimals: 5,
      currency: 'USD',
    },
    marketSchedule: 'traditional_metals',
    timezone: 'UTC',
    candleConstruction: 'bid_ask_midpoint',
    discrepancyTolerances: {
      maxPriceDiffPct: 0.05,
      maxDelaySeconds: 5,
    },
    notes: 'Interbank spot forex quotes.',
  },
];

export interface MarketComparisonSnapshot {
  platform: 'JARVIS' | 'MT5' | 'TradingView';
  sourceName: string;
  symbol: string;
  status: 'CONNECTED' | 'UNAVAILABLE' | 'MANUAL_BENCHMARK';
  price: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  timestampUtc: string;
  dataAgeSeconds: number;
}

export interface DiscrepancyReport {
  hasDiscrepancy: boolean;
  absoluteDiff: number;
  percentDiff: number;
  ohlcDiffMax: number;
  timeDiffSeconds: number;
  feedDelaySeconds: number;
  warningMessage?: string;
  tolerancesExceeded: boolean;
}

export class InstrumentIdentityService {
  public static getIdentity(symbolOrId: string): InstrumentIdentityConfig {
    const clean = symbolOrId.toUpperCase().replace(/[-_/]/g, '');
    const found = CANONICAL_INSTRUMENT_IDENTITIES.find(
      (inst) =>
        inst.id === symbolOrId ||
        inst.jarvisSymbol.toUpperCase().replace(/[-_/]/g, '') === clean ||
        inst.providerSymbol.toUpperCase().replace(/[-_/]/g, '') === clean
    );

    if (found) return found;

    // Default fallback specification
    return {
      id: symbolOrId,
      jarvisSymbol: symbolOrId,
      displayName: symbolOrId,
      category: 'crypto',
      marketType: 'spot',
      brokerOrExchange: 'Exchange Provider',
      providerId: 'binance',
      providerSymbol: symbolOrId,
      tradingViewSymbol: symbolOrId,
      mt5BrokerSymbol: symbolOrId,
      contractSpecs: {
        contractMultiplier: 1,
        tickSize: 0.01,
        lotSize: 0.001,
        minQuantity: 0.001,
        priceDecimals: 2,
        currency: 'USD',
      },
      marketSchedule: '24_7',
      timezone: 'UTC',
      candleConstruction: 'traded_ticks',
      discrepancyTolerances: {
        maxPriceDiffPct: 0.2,
        maxDelaySeconds: 5,
      },
      notes: 'Custom or uncataloged instrument.',
    };
  }

  /**
   * Calculate exact discrepancy metrics between JARVIS and external platform reference
   */
  public static calculateDiscrepancy(
    jarvisSnapshot: MarketComparisonSnapshot,
    referenceSnapshot: MarketComparisonSnapshot,
    tolerances: { maxPriceDiffPct: number; maxDelaySeconds: number }
  ): DiscrepancyReport {
    if (
      jarvisSnapshot.price === null ||
      referenceSnapshot.price === null ||
      referenceSnapshot.status === 'UNAVAILABLE'
    ) {
      return {
        hasDiscrepancy: false,
        absoluteDiff: 0,
        percentDiff: 0,
        ohlcDiffMax: 0,
        timeDiffSeconds: 0,
        feedDelaySeconds: 0,
        tolerancesExceeded: false,
      };
    }

    const absDiff = Math.abs(jarvisSnapshot.price - referenceSnapshot.price);
    const pctDiff = Math.round((absDiff / referenceSnapshot.price) * 10000) / 100;

    let ohlcDiffMax = 0;
    if (
      jarvisSnapshot.open !== null && referenceSnapshot.open !== null &&
      jarvisSnapshot.high !== null && referenceSnapshot.high !== null &&
      jarvisSnapshot.low !== null && referenceSnapshot.low !== null &&
      jarvisSnapshot.close !== null && referenceSnapshot.close !== null
    ) {
      const oDiff = Math.abs(jarvisSnapshot.open - referenceSnapshot.open);
      const hDiff = Math.abs(jarvisSnapshot.high - referenceSnapshot.high);
      const lDiff = Math.abs(jarvisSnapshot.low - referenceSnapshot.low);
      const cDiff = Math.abs(jarvisSnapshot.close - referenceSnapshot.close);
      ohlcDiffMax = Math.max(oDiff, hDiff, lDiff, cDiff);
    }

    const feedDelaySeconds = Math.abs(jarvisSnapshot.dataAgeSeconds - referenceSnapshot.dataAgeSeconds);
    const tolerancesExceeded = pctDiff > tolerances.maxPriceDiffPct || feedDelaySeconds > tolerances.maxDelaySeconds;

    let warningMessage: string | undefined;
    if (tolerancesExceeded) {
      warningMessage = `Discrepancy detected: ${pctDiff}% price spread exceeds ${tolerances.maxPriceDiffPct}% tolerance (Ref: ${referenceSnapshot.sourceName}). Check broker spread or market type parity.`;
    }

    return {
      hasDiscrepancy: pctDiff > 0.02,
      absoluteDiff: Math.round(absDiff * 1000) / 1000,
      percentDiff: pctDiff,
      ohlcDiffMax: Math.round(ohlcDiffMax * 1000) / 1000,
      timeDiffSeconds: 0,
      feedDelaySeconds,
      warningMessage,
      tolerancesExceeded,
    };
  }
}
