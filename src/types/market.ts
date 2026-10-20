/**
 * Market Data & Order Book Type Definitions
 * JARVIS HEATMAP TERMINAL
 */

export type ExchangeId = 'binance' | 'bybit' | 'comex' | 'goldprice_dev';

export type MarketType = 'spot' | 'spot_otc' | 'linear_perpetual' | 'commodity_futures';

export interface SymbolInfo {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  priceTick: number;       // e.g. 0.01 for BTCUSDT
  lotSize: number;         // e.g. 0.00001
  minQty: number;
  minNotional: number;
}

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'LIVE' | 'STALE' | 'RESYNCING';

export interface LatencyMetrics {
  wsPingMs: number;
  orderBookAgeMs: number;
  lastMessageTimestamp: number;
  messageRatePerSec: number;
  totalMessagesProcessed: number;
  sequenceGapsDetected: number;
  resyncCount: number;
}

export type TradeSide = 'buy' | 'sell' | 'unknown';

export interface MarketTrade {
  id: string;
  timestamp: number;       // Milliseconds
  price: number;
  quantity: number;
  notional: number;
  side: TradeSide;         // 'buy' = buyer aggressor, 'sell' = seller aggressor, 'unknown'
  isBuyerMaker?: boolean;
  exchange?: ExchangeId | string;
  symbol?: string;
  marketType?: MarketType;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount?: number;
}

export interface DepthSnapshot {
  lastUpdateId: number;
  timestamp: number;
  bids: [number, number][]; // [price, quantity]
  asks: [number, number][];
}

export interface DepthDeltaUpdate {
  firstUpdateId: number;
  finalUpdateId: number;
  prevFinalUpdateId?: number;
  eventTime: number;
  bids: [number, number][]; // [price, quantity]. quantity 0 means delete
  asks: [number, number][];
}

export interface Candle {
  time: number; // Unix timestamp in seconds (TradingView Lightweight Charts format) or ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume?: number;
  tradeCount?: number;
}

export type CandleTimeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1d';
