/**
 * Instrument Registry
 * Authoritative registry defining supported instruments, their data providers,
 * contract types, supported intervals, and order-flow feature capabilities.
 */

import { CandleTimeframe, ExchangeId } from '../../types/market';
import { MarketSchedule } from './MarketSessionService';

export type InstrumentCategory = 'crypto' | 'metals' | 'futures' | 'forex';

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
  // 1. Primary Gold Derivatives: XAU/USDT (Bybit Linear Continuous Perpetual - 0 Synthetic Offsets)
  {
    id: 'XAUUSD',
    symbol: 'XAUUSD',
    displayName: 'XAU/USDT • Bybit (Gold Perpetual Futures)',
    shortLabel: 'XAU/USDT Bybit',
    category: 'metals',
    instrumentType: 'linear_perpetual',
    typeLabel: 'Linear Perpetual',
    provider: 'Bybit Derivatives',
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
    description: 'Bybit Linear XAUUSDT continuous perpetual futures with real-time Level 2 order book, full depth ladder, and public trade stream. 1:1 authentic exchange prices with 0 synthetic offsets.',
  },

  // 2. Secondary Gold Spot: XAU/USD (Vantage MT5 CFD - Requires Authorized Broker Credentials)
  {
    id: 'XAUUSD_VANTAGE',
    symbol: 'XAUUSD_VANTAGE',
    displayName: 'XAU/USD • Vantage (Requires MT5 Bridge)',
    shortLabel: 'XAU/USD Vantage',
    category: 'metals',
    instrumentType: 'spot_otc',
    typeLabel: 'Vantage MT5 CFD',
    provider: 'Vantage Markets (MT5)',
    providerId: 'mt5',
    marketSchedule: 'traditional_metals',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.01,
    supportsOrderBook: false,
    supportsTrades: false,
    supportsHeatmap: false,
    supportsFootprint: false,
    supportsBubbles: false,
    unsupportedFeaturesNotice: 'Direct Vantage pricing requires an active MT4/MT5 Broker Bridge connection with authorized Vantage credentials (server, account, investor password / MetaApi token).',
    description: 'Vantage FX retail Spot Gold OTC CFD feed. Requires active MT4/MT5 broker bridge credentials to stream live prices.',
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

  // 5. Forex Major Pairs (Pip precision: 0.0001, Traditional Market Session)
  {
    id: 'EURUSD',
    symbol: 'EURUSD',
    displayName: 'EUR/USD • Spot Forex',
    shortLabel: 'EUR/USD',
    category: 'forex',
    instrumentType: 'spot',
    typeLabel: 'Forex',
    provider: 'Binance / Global FX',
    providerId: 'binance',
    marketSchedule: 'traditional_metals',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.0001,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'Euro / US Dollar major currency pair with 4-decimal pip precision.',
  },
  {
    id: 'GBPUSD',
    symbol: 'GBPUSD',
    displayName: 'GBP/USD • Spot Forex',
    shortLabel: 'GBP/USD',
    category: 'forex',
    instrumentType: 'spot',
    typeLabel: 'Forex',
    provider: 'Binance / Global FX',
    providerId: 'binance',
    marketSchedule: 'traditional_metals',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '1m',
    priceTick: 0.0001,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'British Pound / US Dollar major currency pair with 4-decimal pip precision.',
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
    if (clean === 'BTC' || clean === 'BTCUSD' || clean === 'BTCUSDT' || clean === 'BTCUSDTSPOT') return INSTRUMENT_CATALOG[3];
    if (clean === 'ETH' || clean === 'ETHUSD' || clean === 'ETHUSDT' || clean === 'ETHUSDTSPOT') return INSTRUMENT_CATALOG[4];
    if (clean === 'SOL' || clean === 'SOLUSD' || clean === 'SOLUSDT' || clean === 'SOLUSDTSPOT') return INSTRUMENT_CATALOG[5];
    if (clean === 'BNB' || clean === 'BNBUSD' || clean === 'BNBUSDT' || clean === 'BNBUSDTSPOT') return INSTRUMENT_CATALOG[6];
    if (clean === 'EURUSD' || clean === 'EUR' || clean === 'EURUSDT') return INSTRUMENT_CATALOG[7];
    if (clean === 'GBPUSD' || clean === 'GBP' || clean === 'GBPUSDT') return INSTRUMENT_CATALOG[8];

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
