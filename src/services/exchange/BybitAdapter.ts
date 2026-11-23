/**
 * Bybit Exchange Adapter
 * Connects to Bybit v5 Public Spot Market Data
 * Streams: orderbook.50.{symbol}, publicTrade.{symbol}, kline.{interval}.{symbol}
 * REST: /v5/market/orderbook, /v5/market/recent-trade, /v5/market/kline
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

const BYBIT_INTERVAL_MAP: Record<CandleTimeframe, string> = {
  '1m': '1',
  '3m': '3',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '1d': 'D',
};

export class BybitAdapter implements IExchangeAdapter {
  readonly id: ExchangeId = 'bybit';
  readonly name = 'Bybit Spot';

  private ws: WebSocket | null = null;
  private currentSymbol: string = 'BTCUSDT';
  private currentTimeframe: CandleTimeframe = '5m';
  private events: ExchangeAdapterEvents | null = null;
  private connectionState: ConnectionState = 'DISCONNECTED';

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

  private getCategory(symbol: string): 'spot' | 'linear' {
    const s = symbol.toUpperCase().replace(/[-_/]/g, '');
    return s.startsWith('XAU') || s.startsWith('GOLD') ? 'linear' : 'spot';
  }

  private getEffectiveSymbol(symbol: string): string {
    const s = symbol.toUpperCase().replace(/[-_/]/g, '');
    if (s === 'XAUUSD' || s === 'GOLD') return 'XAUUSDT';
    return s;
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const cleanSym = this.getEffectiveSymbol(symbol);
    const isGold = this.getCategory(cleanSym) === 'linear';
    return {
      id: cleanSym,
      symbol: cleanSym,
      baseAsset: isGold ? 'XAU' : cleanSym.replace(/(USDT|USDC|EUR)$/, ''),
      quoteAsset: cleanSym.endsWith('USDT') ? 'USDT' : 'USD',
      priceTick: isGold ? 0.01 : cleanSym.includes('BTC') ? 0.01 : cleanSym.includes('ETH') ? 0.01 : 0.001,
      lotSize: isGold ? 0.001 : 0.00001,
      minQty: isGold ? 0.001 : 0.00001,
      minNotional: 5.0,
    };
  }

  connect(symbol: string, timeframe: CandleTimeframe, events: ExchangeAdapterEvents): void {
    this.shouldReconnect = true;
    this.currentSymbol = this.getEffectiveSymbol(symbol);
    this.currentTimeframe = timeframe;
    this.events = events;

    this.disconnect(false);
    this.initWebSocket();
    this.startMetricsTimer();
  }

  private initWebSocket(): void {
    if (!this.currentSymbol) return;

    this.setConnectionState('CONNECTING');
    const effSym = this.getEffectiveSymbol(this.currentSymbol);
    const category = this.getCategory(effSym);
    const wsUrl = category === 'linear'
      ? 'wss://stream.bybit.com/v5/public/linear'
      : 'wss://stream.bybit.com/v5/public/spot';

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setConnectionState('LIVE');
        // Subscribe to orderbook, trades, and kline topics
        const intervalStr = BYBIT_INTERVAL_MAP[this.currentTimeframe] || '5';
        const subMsg = {
          op: 'subscribe',
          args: [
            `orderbook.50.${effSym}`,
            `publicTrade.${effSym}`,
            `kline.${intervalStr}.${effSym}`,
          ],
        };
        this.ws?.send(JSON.stringify(subMsg));

        // Start ping interval every 20s to keep connection alive
        this.pingIntervalId = window.setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ op: 'ping' }));
          }
        }, 20000);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn('[BybitAdapter] WebSocket Error:', err);
        this.events?.onError(new Error('Bybit WebSocket error'));
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
      if (payload.op === 'pong' || payload.ret_msg === 'pong') {
        return;
      }

      const now = Date.now();
      this.messagesInSecond++;
      this.metrics.totalMessagesProcessed++;
      this.metrics.lastMessageTimestamp = now;

      const topic: string = payload.topic || '';
      if (this.currentSymbol && topic && !topic.toUpperCase().includes(this.currentSymbol.toUpperCase())) {
        return;
      }

      const data = payload.data;
      if (!data) return;

      // 1. Order book update
      if (topic.startsWith('orderbook')) {
        const eventTime = payload.ts || now;
        this.metrics.orderBookAgeMs = Math.max(0, now - eventTime);

        const bids: [number, number][] = (data.b || []).map((b: [string, string]) => [
          parseFloat(b[0]),
          parseFloat(b[1]),
        ]);
        const asks: [number, number][] = (data.a || []).map((a: [string, string]) => [
          parseFloat(a[0]),
          parseFloat(a[1]),
        ]);

        const update: DepthDeltaUpdate = {
          firstUpdateId: data.seq || payload.cts || now,
          finalUpdateId: data.seq || payload.cts || now,
          prevFinalUpdateId: 0,
          bids,
          asks,
          eventTime,
        };

        this.events?.onDepthUpdate(update);
      }
      // 2. Trade execution update
      else if (topic.startsWith('publicTrade')) {
        const tradeList = Array.isArray(data) ? data : [data];
        const category = this.getCategory(this.currentSymbol);
        for (const t of tradeList) {
          const tradePrice = parseFloat(t.p);
          const tradeQty = parseFloat(t.v);
          if (isNaN(tradePrice) || isNaN(tradeQty) || tradePrice <= 0 || tradeQty <= 0) continue;

          const side: 'buy' | 'sell' = String(t.S).toLowerCase() === 'buy' ? 'buy' : 'sell';
          const trade: MarketTrade = {
            id: String(t.i || `${t.T}_${tradePrice}`),
            timestamp: t.T || now,
            price: tradePrice,
            quantity: tradeQty,
            notional: tradePrice * tradeQty,
            side,
            isBuyerMaker: side === 'sell',
            exchange: 'bybit',
            symbol: this.currentSymbol,
            marketType: category === 'linear' ? 'linear_perpetual' : 'spot',
          };

          this.events?.onTrade(trade);
        }
      }
      // 3. Kline candlestick update
      else if (topic.startsWith('kline')) {
        const klineList = Array.isArray(data) ? data : [data];
        const k = klineList[0];
        if (k) {
          const candle: Candle = {
            time: Math.floor(parseInt(k.start, 10) / 1000),
            open: parseFloat(k.open),
            high: parseFloat(k.high),
            low: parseFloat(k.low),
            close: parseFloat(k.close),
            volume: parseFloat(k.volume),
            buyVolume: undefined,
            tradeCount: undefined,
          };
          this.events?.onKline?.(candle);
        }
      }
    } catch (e) {
      console.warn('[BybitAdapter] Failed parsing message:', e);
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
      const now = Date.now();
      if (
        this.connectionState === 'LIVE' &&
        this.metrics.lastMessageTimestamp > 0 &&
        now - this.metrics.lastMessageTimestamp > 6000
      ) {
        this.setConnectionState('STALE');
      } else if (
        this.connectionState === 'STALE' &&
        now - this.metrics.lastMessageTimestamp <= 6000
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

  async fetchDepthSnapshot(symbol: string, limit: number = 50): Promise<DepthSnapshot> {
    const sym = this.getEffectiveSymbol(symbol);
    const category = this.getCategory(sym);
    const url = `https://api.bybit.com/v5/market/orderbook?category=${category}&symbol=${sym}&limit=${Math.min(limit, 50)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bybit depth snapshot failed: ${res.statusText}`);
    const json = await res.json();
    const result = json.result;
    if (!result) throw new Error('Bybit depth snapshot returned empty result');

    const bids: [number, number][] = (result.b || []).map((b: [string, string]) => [
      parseFloat(b[0]),
      parseFloat(b[1]),
    ]);
    const asks: [number, number][] = (result.a || []).map((a: [string, string]) => [
      parseFloat(a[0]),
      parseFloat(a[1]),
    ]);

    return {
      lastUpdateId: result.seq || result.u || Date.now(),
      bids,
      asks,
      timestamp: result.ts || Date.now(),
    };
  }

  async fetchRecentTrades(symbol: string, limit: number = 500): Promise<MarketTrade[]> {
    const sym = this.getEffectiveSymbol(symbol);
    const category = this.getCategory(sym);
    const url = `https://api.bybit.com/v5/market/recent-trade?category=${category}&symbol=${sym}&limit=${Math.min(limit, 500)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bybit recent trades failed: ${res.statusText}`);
    const json = await res.json();
    const list = json.result?.list || [];

    return list.map((t: any) => {
      const p = parseFloat(t.price);
      const q = parseFloat(t.size);
      const side: 'buy' | 'sell' = String(t.side).toLowerCase() === 'buy' ? 'buy' : 'sell';
      return {
        id: String(t.execId || `${t.time}_${p}`),
        timestamp: parseInt(t.time, 10),
        price: p,
        quantity: q,
        notional: p * q,
        side,
        isBuyerMaker: side === 'sell',
        exchange: 'bybit' as ExchangeId,
        symbol: sym,
        marketType: category === 'linear' ? ('linear_perpetual' as const) : ('spot' as const),
      };
    });
  }

  async fetchHistoricalCandles(
    symbol: string,
    interval: CandleTimeframe,
    startTime?: number,
    endTime?: number,
    limit: number = 1000
  ): Promise<Candle[]> {
    const sym = this.getEffectiveSymbol(symbol);
    const category = this.getCategory(sym);
    const bybitInterval = BYBIT_INTERVAL_MAP[interval] || '5';
    let url = `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${sym}&interval=${bybitInterval}&limit=${Math.min(limit, 1000)}`;
    if (startTime) url += `&start=${startTime}`;
    if (endTime) url += `&end=${endTime}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bybit historical klines failed: ${res.statusText}`);
    const json = await res.json();
    const rawList: any[] = json.result?.list || [];

    // Bybit returns newest first; reverse for chronological order
    const list = [...rawList].reverse();

    return list.map((item: any[]) => ({
      time: Math.floor(parseInt(item[0], 10) / 1000),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
      buyVolume: undefined,
      tradeCount: undefined,
    }));
  }

  async fetchAggTrades(
    symbol: string,
    _startTime?: number,
    _endTime?: number,
    limit: number = 500
  ): Promise<MarketTrade[]> {
    return this.fetchRecentTrades(symbol, limit);
  }
}
