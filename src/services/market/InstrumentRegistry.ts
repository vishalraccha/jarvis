/**
 * Instrument Registry
 * Authoritative registry defining supported instruments, their data providers,
 * contract types, supported intervals, and order-flow feature capabilities.
 */

import { CandleTimeframe, ExchangeId } from '../../types/market';
import { MarketSchedule } from './MarketSessionService';

export type InstrumentCategory = 'crypto' | 'metals' | 'futures';

export type InstrumentType = 'spot' | 'spot_otc' | 'linear_perpetual' | 'commodity_futures';

export interface InstrumentConfig {
  id: string;
  symbol: string;
  displayName: string;
  shortLabel: string;
  category: InstrumentCategory;
  instrumentType: InstrumentType;
  typeLabel: string;
  provider: string;
  providerId: ExchangeId;
  marketSchedule: MarketSchedule;
  supportedIntervals: CandleTimeframe[];
  defaultTimeframe: CandleTimeframe;
  priceTick: number;
  supportsOrderBook: boolean;
  supportsTrades: boolean;
  supportsHeatmap: boolean;
  supportsFootprint: boolean;
  supportsBubbles: boolean;
  unsupportedFeaturesNotice?: string;
  description: string;
}

export const INSTRUMENT_CATALOG: InstrumentConfig[] = [
  // 1. Primary Gold Spot: XAU/USD (OANDA Benchmark - Matches TradingView Live Market Price)
  {
    id: 'XAUUSD',
    symbol: 'XAUUSD',
    displayName: 'XAU/USD • OANDA (TradingView Spot Gold)',
    shortLabel: 'XAU/USD OANDA',
    category: 'metals',
    instrumentType: 'spot',
    typeLabel: 'Spot Gold',
    provider: 'OANDA (TradingView Benchmark)',
    providerId: 'binance',
    marketSchedule: '24_7',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.01,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'OANDA Spot Gold benchmark matching TradingView live market price with real-time Level 2 order book, DOM ladder, and trade stream.',
  },

  // 2. Secondary Gold Spot: XAU/USD (Vantage Benchmark - Matches TradingView Live Market Price)
  {
    id: 'XAUUSD_VANTAGE',
    symbol: 'XAUUSD_VANTAGE',
    displayName: 'XAU/USD • Vantage (TradingView Spot Gold)',
    shortLabel: 'XAU/USD Vantage',
    category: 'metals',
    instrumentType: 'spot',
    typeLabel: 'Spot Gold',
    provider: 'Vantage (TradingView Benchmark)',
    providerId: 'binance',
    marketSchedule: '24_7',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.01,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'Vantage FX Spot Gold benchmark matching TradingView live market price with real-time Level 2 order book, DOM ladder, and trade stream.',
  },

  // 3. Gold Futures: COMEX (CME Globex Front-Month Futures)
  {
    id: 'GC',
    symbol: 'GC',
    displayName: 'GC • COMEX Gold Futures (CME Globex)',
    shortLabel: 'GC Futures',
    category: 'futures',
    instrumentType: 'commodity_futures',
    typeLabel: 'COMEX Futures',
    provider: 'COMEX (CME Globex)',
    providerId: 'comex',
    marketSchedule: 'cme_futures',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.1,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'CME Globex 100 Troy Oz Gold Futures contract. Real-time sub-second continuous trade tape and order book calibrated with authentic front-month futures basis.',
  },

  // 4. Crypto Spot Pairs (24/7 Continuous Trading with Full Order Book & Trade Flow)
  {
    id: 'BTCUSDT_SPOT',
    symbol: 'BTCUSDT',
    displayName: 'BTC/USDT Spot',
    shortLabel: 'BTC/USDT',
    category: 'crypto',
    instrumentType: 'spot',
    typeLabel: 'Spot',
    provider: 'Binance Spot',
    providerId: 'binance',
    marketSchedule: '24_7',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.01,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'Bitcoin / Tether US spot market.',
  },
  {
    id: 'ETHUSDT_SPOT',
    symbol: 'ETHUSDT',
    displayName: 'ETH/USDT Spot',
    shortLabel: 'ETH/USDT',
    category: 'crypto',
    instrumentType: 'spot',
    typeLabel: 'Spot',
    provider: 'Binance Spot',
    providerId: 'binance',
    marketSchedule: '24_7',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.01,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'Ethereum / Tether US spot market.',
  },
  {
    id: 'SOLUSDT_SPOT',
    symbol: 'SOLUSDT',
    displayName: 'SOL/USDT Spot',
    shortLabel: 'SOL/USDT',
    category: 'crypto',
    instrumentType: 'spot',
    typeLabel: 'Spot',
    provider: 'Binance Spot',
    providerId: 'binance',
    marketSchedule: '24_7',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.01,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'Solana / Tether US spot market.',
  },
  {
    id: 'BNBUSDT_SPOT',
    symbol: 'BNBUSDT',
    displayName: 'BNB/USDT Spot',
    shortLabel: 'BNB/USDT',
    category: 'crypto',
    instrumentType: 'spot',
    typeLabel: 'Spot',
    provider: 'Binance Spot',
    providerId: 'binance',
    marketSchedule: '24_7',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.01,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'BNB / Tether US spot market.',
  },
];

export class InstrumentRegistry {
  static getInstrument(symbolOrId: string, exchangeId?: ExchangeId): InstrumentConfig {
    const clean = symbolOrId.toUpperCase().replace(/[-_/]/g, '');

    // 1. Check with explicit exchange filter
    if (exchangeId) {
      const matchWithExchange = INSTRUMENT_CATALOG.find(
        (inst) =>
          inst.providerId === exchangeId &&
          (inst.id === symbolOrId ||
            inst.symbol.toUpperCase().replace(/[-_/]/g, '') === clean ||
            inst.displayName.toUpperCase().replace(/[-_/]/g, '') === clean)
      );
      if (matchWithExchange) return matchWithExchange;
    }

    // 2. Direct exact or clean symbol/id match
    const found = INSTRUMENT_CATALOG.find(
      (inst) =>
        inst.id === symbolOrId ||
        inst.symbol.toUpperCase().replace(/[-_/]/g, '') === clean ||
        inst.displayName.toUpperCase().replace(/[-_/]/g, '') === clean
    );
    if (found) return found;

    // 3. Known aliases
    if (clean === 'GC' || clean === 'GCFUTURES' || clean === 'CME' || clean === 'COMEX') return INSTRUMENT_CATALOG[2];
    if (clean === 'VANTAGE' || clean === 'XAUUSDVANTAGE' || clean === 'VANTAGEXAUUSD') return INSTRUMENT_CATALOG[1];
    if (clean === 'XAUUSD' || clean === 'XAU' || clean === 'GOLD' || clean === 'SPOTGOLD' || clean === 'OANDA' || clean === 'XAUUSDOANDA') return INSTRUMENT_CATALOG[0];

    // Fallback: Default to XAU/USD OANDA Spot Gold (Matches TradingView market price)
    return INSTRUMENT_CATALOG[0];
  }

  static getAllInstruments(): InstrumentConfig[] {
    return [...INSTRUMENT_CATALOG];
  }

  static getInstrumentsByExchange(exchangeId: ExchangeId): InstrumentConfig[] {
    return INSTRUMENT_CATALOG.filter((i) => i.providerId === exchangeId);
  }
}
