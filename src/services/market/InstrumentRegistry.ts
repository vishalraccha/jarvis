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
  // 1. Traditional Spot Gold (OTC XAU/USD via GoldPrice.dev)
  {
    id: 'XAUUSD_SPOT',
    symbol: 'XAUUSD',
    displayName: 'XAUUSD Spot',
    shortLabel: 'XAUUSD Spot',
    category: 'metals',
    instrumentType: 'spot_otc',
    typeLabel: 'Spot OTC',
    provider: 'GoldPrice.dev',
    providerId: 'goldprice_dev',
    marketSchedule: 'traditional_metals',
    supportedIntervals: ['1d'], // Free tier provides daily (1D) bars; no fake intraday
    defaultTimeframe: '1d',
    priceTick: 0.01,
    supportsOrderBook: false,
    supportsTrades: false,
    supportsHeatmap: false,
    supportsFootprint: false,
    supportsBubbles: false,
    unsupportedFeaturesNotice:
      'Heatmap, Footprint & DOM Profile are disabled: GoldPrice.dev free tier provides daily OHLC quotes only, without L2 order book depth or executed trade stream.',
    description: 'Gold Spot OTC quote (Troy Ounce in USD).',
  },

  // 2. Gold Perpetual (XAUUSDT via Binance / Bybit Futures)
  {
    id: 'XAUUSDT_PERP',
    symbol: 'XAUUSDT',
    displayName: 'XAUUSDT Perpetual',
    shortLabel: 'XAUUSDT Perp',
    category: 'metals',
    instrumentType: 'linear_perpetual',
    typeLabel: 'Linear Perpetual',
    provider: 'Binance Futures',
    providerId: 'binance',
    marketSchedule: '24_7',
    supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'],
    defaultTimeframe: '5m',
    priceTick: 0.01,
    supportsOrderBook: true,
    supportsTrades: true,
    supportsHeatmap: true,
    supportsFootprint: true,
    supportsBubbles: true,
    description: 'Gold synthetic perpetual pegged to Gold spot/futures index with full order book & trade stream.',
  },

  // 3. COMEX Gold Futures (GC)
  {
    id: 'GC_FUTURES',
    symbol: 'GC',
    displayName: 'GC Gold Futures',
    shortLabel: 'GC Futures',
    category: 'futures',
    instrumentType: 'commodity_futures',
    typeLabel: 'COMEX Futures',
    provider: 'COMEX (Proxy)',
    providerId: 'goldprice_dev',
    marketSchedule: 'cme_futures',
    supportedIntervals: ['1d'],
    defaultTimeframe: '1d',
    priceTick: 0.1,
    supportsOrderBook: false,
    supportsTrades: false,
    supportsHeatmap: false,
    supportsFootprint: false,
    supportsBubbles: false,
    unsupportedFeaturesNotice:
      'Direct COMEX L2 depth and trade tape require a licensed CME institutional market feed. Daily settlement proxy is available.',
    description: 'CME/COMEX 100 Troy Oz Gold Futures contract.',
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
  static getInstrument(symbolOrId: string): InstrumentConfig {
    const clean = symbolOrId.toUpperCase().replace(/[-_/]/g, '');
    const found = INSTRUMENT_CATALOG.find(
      (inst) =>
        inst.id === symbolOrId ||
        inst.symbol.toUpperCase().replace(/[-_/]/g, '') === clean ||
        inst.displayName.toUpperCase().replace(/[-_/]/g, '') === clean
    );
    if (found) return found;

    // Fallback: Default to BTCUSDT Spot
    return INSTRUMENT_CATALOG[3];
  }

  static getAllInstruments(): InstrumentConfig[] {
    return [...INSTRUMENT_CATALOG];
  }

  static getInstrumentsByExchange(exchangeId: ExchangeId): InstrumentConfig[] {
    return INSTRUMENT_CATALOG.filter((i) => i.providerId === exchangeId);
  }
}
