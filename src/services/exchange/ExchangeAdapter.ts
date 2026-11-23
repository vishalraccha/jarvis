/**
 * Abstract Exchange Adapter Interface
 * Allows clean pluggability for Binance, Bybit, Coinbase, etc.
 */

import {
  Candle,
  CandleTimeframe,
  ConnectionState,
  DepthDeltaUpdate,
  DepthSnapshot,
  ExchangeId,
  LatencyMetrics,
  MarketTrade,
  SymbolInfo,
} from '../../types/market';

export interface ExchangeAdapterEvents {
  onDepthUpdate: (update: DepthDeltaUpdate) => void;
  onTrade: (trade: MarketTrade) => void;
  onKline?: (candle: Candle) => void;
  onConnectionChange: (state: ConnectionState, metrics: LatencyMetrics) => void;
  onError: (error: Error) => void;
}

export interface IExchangeAdapter {
  readonly id: ExchangeId;
  readonly name: string;
  getConnectionState(): ConnectionState;
  getLatencyMetrics(): LatencyMetrics;
  getSymbolInfo(symbol: string): Promise<SymbolInfo>;

  connect(symbol: string, timeframe: CandleTimeframe, events: ExchangeAdapterEvents): void;
  disconnect(): void;

  fetchDepthSnapshot(symbol: string, limit?: number): Promise<DepthSnapshot>;
  fetchRecentTrades(symbol: string, limit?: number): Promise<MarketTrade[]>;
  fetchHistoricalCandles(
    symbol: string,
    interval: CandleTimeframe,
    startTime?: number,
    endTime?: number,
    limit?: number
  ): Promise<Candle[]>;
  fetchAggTrades?(
    symbol: string,
    startTime?: number,
    endTime?: number,
    limit?: number
  ): Promise<MarketTrade[]>;
}
