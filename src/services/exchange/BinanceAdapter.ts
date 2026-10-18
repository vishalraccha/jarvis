/**
 * Binance Exchange Adapter
 * Connects to Binance Public Market Data (Spot)
 * Streams: @depth@100ms & @trade
 * REST: /api/v3/depth & /api/v3/klines
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
import { ExchangeAdapterEvents, IExchangeAdapter } from './ExchangeAdapter';

export class BinanceAdapter implements IExchangeAdapter {
  readonly id: ExchangeId = 'binance';
  readonly name = 'Binance Spot';

  private ws: WebSocket | null = null;
  private currentSymbol: string = '';
  private currentTimeframe: CandleTimeframe = '5m';
  private events: ExchangeAdapterEvents | null = null;
  private connectionState: ConnectionState = 'DISCONNECTED';

  // Metrics
  private metrics: LatencyMetrics = {
    wsPingMs: 0,
    orderBookAgeMs: 0,
    lastMessageTimestamp: 0,
    messageRatePerSec: 0,
    totalMessagesProcessed: 0,
    sequenceGapsDetected: 0,
    resyncCount: 0,
  };

  private pingIntervalId: number | null = null;
  private statsIntervalId: number | null = null;
  private messagesInSecond: number = 0;
  private reconnectTimeoutId: number | null = null;
  private shouldReconnect: boolean = true;

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getLatencyMetrics(): LatencyMetrics {
    return { ...this.metrics };
  }

  private isFutures(symbol: string): boolean {
    const s = symbol.toUpperCase().replace(/[-_/]/g, '');
    return s.startsWith('XAU') || s.startsWith('GOLD');
  }

  private getEffectiveSymbol(symbol: string): string {
    const s = symbol.toUpperCase().replace(/[-_/]/g, '');
    if (s === 'XAUUSD' || s === 'GOLD') return 'XAUUSDT';
    return s;
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const cleanSym = this.getEffectiveSymbol(symbol);
    const isGold = this.isFutures(cleanSym);
    return {
      id: cleanSym,
      symbol: cleanSym,
      baseAsset: isGold ? 'XAU' : cleanSym.replace(/(USDT|BUSD|FDUSD|USDC|EUR)$/, ''),
      quoteAsset: cleanSym.endsWith('USDT') ? 'USDT' : 'USD',
      priceTick: isGold ? 0.01 : cleanSym.includes('BTC') ? 0.01 : 0.001,
      lotSize: isGold ? 0.001 : 0.00001,
      minQty: isGold ? 0.001 : 0.00001,
      minNotional: 5.0,
    };
  }

  connect(symbol: string, timeframe: CandleTimeframe, events: ExchangeAdapterEvents): void {
    this.shouldReconnect = true;
    this.currentSymbol = this.getEffectiveSymbol(symbol).toLowerCase();
    this.currentTimeframe = timeframe;
    this.events = events;

    this.disconnect(false);
    this.initWebSocket();
    this.startMetricsTimer();
  }

  private initWebSocket(): void {
    if (!this.currentSymbol) return;

    this.setConnectionState('CONNECTING');
    const effSym = this.getEffectiveSymbol(this.currentSymbol).toLowerCase();
    const isFut = this.isFutures(effSym);
    const streamName = `${effSym}@depth@100ms/${effSym}@trade/${effSym}@kline_${this.currentTimeframe}`;
    const wsUrl = isFut
      ? `wss://fstream.binance.com/stream?streams=${streamName}`
      : `wss://stream.binance.com:9443/stream?streams=${streamName}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setConnectionState('LIVE');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn('[BinanceAdapter] WebSocket Error:', err);
        this.events?.onError(new Error('WebSocket connection error'));
      };

      this.ws.onclose = () => {
        if (this.connectionState !== 'DISCONNECTED') {
          this.setConnectionState('DISCONNECTED');
        }
        if (this.shouldReconnect) {
          this.reconnectTimeoutId = window.setTimeout(() => {
            this.initWebSocket();
          }, 3000);
        }
      };
    } catch (err) {
      this.setConnectionState('DISCONNECTED');
      this.events?.onError(err as Error);
    }
  }

  private handleMessage(raw: string): void {
    try {
      const payload = JSON.parse(raw);
      const now = Date.now();
      this.messagesInSecond++;
      this.metrics.totalMessagesProcessed++;
      this.metrics.lastMessageTimestamp = now;

      // Handle Binance combined stream payload: { stream: "...", data: {...} }
      const data = payload.data || payload;

      // Verify that event matches current requested symbol (prevents cross-symbol data leakage)
      const effSym = this.getEffectiveSymbol(this.currentSymbol).toUpperCase();
      if (data.s && effSym && data.s.toUpperCase() !== effSym) {
        return;
      }

      const eventType = data.e;

      if (eventType === 'depthUpdate') {
        const eventTime = data.E || now;
        this.metrics.orderBookAgeMs = Math.max(0, now - eventTime);

        // Convert string arrays to numbers
        const bids: [number, number][] = (data.b || []).map((b: [string, string]) => [
          parseFloat(b[0]),
          parseFloat(b[1]),
        ]);
        const asks: [number, number][] = (data.a || []).map((a: [string, string]) => [
          parseFloat(a[0]),
          parseFloat(a[1]),
        ]);

        const update: DepthDeltaUpdate = {
          firstUpdateId: data.U,
          finalUpdateId: data.u,
          prevFinalUpdateId: data.pu,
          eventTime,
          bids,
          asks,
        };

        this.events?.onDepthUpdate(update);
      } else if (eventType === 'trade' || eventType === 'aggTrade') {
        const tradePrice = parseFloat(data.p);
        const tradeQty = parseFloat(data.q);
        const isBuyerMaker = Boolean(data.m);

        // In Binance: if buyer is maker (m === true), the trade was initiated by a seller (market sell).
        // If m === false, buyer was taker (market buy).
        const side = isBuyerMaker ? 'sell' : 'buy';

        const isFut = this.isFutures(this.currentSymbol);
        const trade: MarketTrade = {
          id: String(data.t || data.a || now),
          timestamp: data.T || data.E || now,
          price: tradePrice,
          quantity: tradeQty,
          notional: tradePrice * tradeQty,
          side,
          isBuyerMaker,
          exchange: 'binance',
          symbol: effSym,
          marketType: isFut ? 'linear_perpetual' : 'spot',
        };

        this.events?.onTrade(trade);
      } else if (eventType === 'kline') {
        const k = data.k;
        if (k) {
          const candle: Candle = {
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            buyVolume: k.V ? parseFloat(k.V) : undefined,
            tradeCount: k.n ? parseInt(k.n, 10) : undefined,
          };
          this.events?.onKline?.(candle);
        }
      }
    } catch (e) {
      console.error('[BinanceAdapter] Failed parsing message:', e);
    }
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.events?.onConnectionChange(state, this.getLatencyMetrics());
  }

  private startMetricsTimer(): void {
    this.stopMetricsTimer();

    this.statsIntervalId = window.setInterval(() => {
      this.metrics.messageRatePerSec = this.messagesInSecond;
      this.messagesInSecond = 0;

      // Check for stale data if no messages received in 4 seconds
      const now = Date.now();
      if (
        this.connectionState === 'LIVE' &&
        this.metrics.lastMessageTimestamp > 0 &&
        now - this.metrics.lastMessageTimestamp > 4000
      ) {
        this.setConnectionState('STALE');
      } else if (
        this.connectionState === 'STALE' &&
        now - this.metrics.lastMessageTimestamp <= 4000
      ) {
        this.setConnectionState('LIVE');
      }

      this.events?.onConnectionChange(this.connectionState, this.getLatencyMetrics());
    }, 1000);
  }

  private stopMetricsTimer(): void {
    if (this.statsIntervalId !== null) {
      clearInterval(this.statsIntervalId);
      this.statsIntervalId = null;
    }
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  disconnect(permanent: boolean = true): void {
    if (permanent) {
      this.shouldReconnect = false;
    }
    if (this.reconnectTimeoutId !== null) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.stopMetricsTimer();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    if (permanent) {
      this.setConnectionState('DISCONNECTED');
    }
  }

  /**
   * Fetch depth snapshot for order book synchronization
   * GET https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=1000
   */
  async fetchDepthSnapshot(symbol: string, limit: number = 1000): Promise<DepthSnapshot> {
    const sym = this.getEffectiveSymbol(symbol);
    const isFut = this.isFutures(sym);
    const baseUrl = isFut ? 'https://fapi.binance.com/fapi/v1/depth' : 'https://api.binance.com/api/v3/depth';
    const url = `${baseUrl}?symbol=${sym}&limit=${Math.min(limit, 1000)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch depth snapshot for ${symbol}: HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      lastUpdateId: data.lastUpdateId,
      timestamp: Date.now(),
      bids: data.bids.map((b: [string, string]) => [parseFloat(b[0]), parseFloat(b[1])]),
      asks: data.asks.map((a: [string, string]) => [parseFloat(a[0]), parseFloat(a[1])]),
    };
  }

  /**
   * Fetch recent trades from Binance REST endpoint
   * GET https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=500
   */
  async fetchRecentTrades(symbol: string, limit: number = 500): Promise<MarketTrade[]> {
    const sym = this.getEffectiveSymbol(symbol);
    const isFut = this.isFutures(sym);
    const baseUrl = isFut ? 'https://fapi.binance.com/fapi/v1/trades' : 'https://api.binance.com/api/v3/trades';
    const url = `${baseUrl}?symbol=${sym}&limit=${Math.min(limit, 1000)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((t: any) => {
      const p = parseFloat(t.price);
      const q = parseFloat(t.qty);
      return {
        id: String(t.id),
        timestamp: t.time,
        price: p,
        quantity: q,
        notional: p * q,
        side: t.isBuyerMaker ? 'sell' : 'buy',
        isBuyerMaker: Boolean(t.isBuyerMaker),
        exchange: 'binance',
        symbol: sym,
        marketType: isFut ? 'linear_perpetual' : 'spot',
      };
    });
  }

  /**
   * Fetch historical aggregate trades from Binance REST endpoint
   * GET https://api.binance.com/api/v3/aggTrades
   */
  async fetchAggTrades(
    symbol: string,
    startTime?: number,
    endTime?: number,
    limit: number = 1000
  ): Promise<MarketTrade[]> {
    const sym = this.getEffectiveSymbol(symbol);
    const isFut = this.isFutures(sym);
    const baseUrl = isFut ? 'https://fapi.binance.com/fapi/v1/aggTrades' : 'https://api.binance.com/api/v3/aggTrades';
    const params = new URLSearchParams({
      symbol: sym,
      limit: String(Math.min(limit, 1000)),
    });
    if (startTime) params.append('startTime', String(startTime));
    if (endTime) params.append('endTime', String(endTime));

    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((item: any) => {
      const p = parseFloat(item.p);
      const q = parseFloat(item.q);
      const isBuyerMaker = Boolean(item.m);
      return {
        id: String(item.a),
        timestamp: item.T,
        price: p,
        quantity: q,
        notional: p * q,
        side: isBuyerMaker ? 'sell' : 'buy',
        isBuyerMaker,
        exchange: 'binance',
        symbol: sym,
        marketType: isFut ? 'linear_perpetual' : 'spot',
      };
    });
  }

  /**
   * Fetch historical klines / candlesticks from Binance
   * GET https://api.binance.com/api/v3/klines
   */
  async fetchHistoricalCandles(
    symbol: string,
    interval: CandleTimeframe,
    startTime?: number,
    endTime?: number,
    limit: number = 1000
  ): Promise<Candle[]> {
    const sym = this.getEffectiveSymbol(symbol);
    const isFut = this.isFutures(sym);
    const baseUrl = isFut ? 'https://fapi.binance.com/fapi/v1/klines' : 'https://api.binance.com/api/v3/klines';
    const params = new URLSearchParams({
      symbol: sym,
      interval,
      limit: String(Math.min(limit, 1000)),
    });
    if (startTime) params.append('startTime', String(startTime));
    if (endTime) params.append('endTime', String(endTime));

    const url = `${baseUrl}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch klines for ${symbol}: HTTP ${res.status}`);
    }

    const data: any[][] = await res.json();
    return data.map((item) => ({
      time: Math.floor(Number(item[0]) / 1000), // TradingView Lightweight Charts uses seconds
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
      tradeCount: Number(item[8]) || undefined,
      buyVolume: parseFloat(item[9]) || undefined,
    }));
  }
}
