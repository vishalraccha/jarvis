/**
 * TradingView Real-Time Market Data Bridge
 * Maintains persistent WebSocket connections to TradingView for sub-second quotes
 * and authentic live 1m candlestick updates for Gold (VANTAGE:XAUUSD) and Nasdaq (PEPPERSTONE:NAS100).
 * Shared across localhost (Vite dev server) and production (Cloud Express backend).
 */

import WebSocket from 'ws';

export interface TVQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface TVLiveCandle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class TradingViewBridge {
  private ws: any = null;
  private isConnecting = false;
  private quoteSessionId = '';
  private nasChartSessionId = '';
  private xauChartSessionId = '';

  public lastQuote: TVQuote = {
    symbol: 'VANTAGE:XAUUSD',
    price: 0,
    bid: 0,
    ask: 0,
    timestamp: 0,
  };

  public lastNasQuote: TVQuote = {
    symbol: 'PEPPERSTONE:NAS100',
    price: 0,
    bid: 0,
    ask: 0,
    timestamp: 0,
  };

  public nasCandles: any[] = [];
  public nasLiveCandle: TVLiveCandle | null = null;
  public xauCandles: any[] = [];
  public xauLiveCandle: TVLiveCandle | null = null;

  private quoteListeners = new Set<(quote: TVQuote) => void>();
  private candleListeners = new Set<(event: { symbol: string; candle: TVLiveCandle }) => void>();

  public onQuote(listener: (quote: TVQuote) => void): () => void {
    this.quoteListeners.add(listener);
    return () => this.quoteListeners.delete(listener);
  }

  public onCandle(listener: (event: { symbol: string; candle: TVLiveCandle }) => void): () => void {
    this.candleListeners.add(listener);
    return () => this.candleListeners.delete(listener);
  }

  private broadcastQuote(_symbol: string, quote: TVQuote) {
    for (const listener of this.quoteListeners) {
      try { listener(quote); } catch {}
    }
  }

  private broadcastCandle(symbol: string, candle: TVLiveCandle) {
    for (const listener of this.candleListeners) {
      try { listener({ symbol, candle }); } catch {}
    }
  }

  public init() {
    this.connect();
    setInterval(() => {
      const now = Date.now();
      const xauStale = this.lastQuote.timestamp > 0 && now - this.lastQuote.timestamp > 20000;
      const nasStale = this.lastNasQuote.timestamp > 0 && now - this.lastNasQuote.timestamp > 20000;
      if (!this.ws || this.ws.readyState !== 1 || xauStale || nasStale) {
        this.connect();
      }
    }, 4000)?.unref?.();
  }

  private prep(obj: any): string {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return '~m~' + str.length + '~m~' + str;
  }

  private connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      if (this.ws) {
        try { this.ws.terminate(); } catch {}
      }

      this.ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket', {
        headers: {
          'Origin': 'https://www.tradingview.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      this.quoteSessionId = 'qs_' + Math.random().toString(36).substring(2, 10);
      this.nasChartSessionId = 'cs_nas_' + Math.random().toString(36).substring(2, 10);
      this.xauChartSessionId = 'cs_xau_' + Math.random().toString(36).substring(2, 10);

      this.ws.on('open', () => {
        this.isConnecting = false;
        try {
          this.ws.send(this.prep({ m: 'set_auth_token', p: ['unauthorized_user_token'] }));
          this.ws.send(this.prep({ m: 'quote_create_session', p: [this.quoteSessionId] }));
          this.ws.send(this.prep({ m: 'quote_set_fields', p: [this.quoteSessionId, 'lp', 'bid', 'ask', 'ch', 'volume'] }));
          this.ws.send(this.prep({ m: 'quote_add_symbols', p: [this.quoteSessionId, 'VANTAGE:XAUUSD', 'OANDA:XAUUSD', 'PEPPERSTONE:NAS100', 'VANTAGE:NAS100'] }));

          // Dedicated persistent real-time chart session for Nasdaq (PEPPERSTONE:NAS100)
          this.ws.send(this.prep({ m: 'chart_create_session', p: [this.nasChartSessionId, ''] }));
          this.ws.send(this.prep({ m: 'resolve_symbol', p: [this.nasChartSessionId, 'sds_nas_sym', '={"symbol":"PEPPERSTONE:NAS100","adjustment":"splits"}'] }));
          this.ws.send(this.prep({ m: 'create_series', p: [this.nasChartSessionId, 'sds_nas_series', 's1', 'sds_nas_sym', '1', 300] }));

          // Dedicated persistent real-time chart session for Gold (VANTAGE:XAUUSD)
          this.ws.send(this.prep({ m: 'chart_create_session', p: [this.xauChartSessionId, ''] }));
          this.ws.send(this.prep({ m: 'resolve_symbol', p: [this.xauChartSessionId, 'sds_xau_sym', '={"symbol":"VANTAGE:XAUUSD","adjustment":"splits"}'] }));
          this.ws.send(this.prep({ m: 'create_series', p: [this.xauChartSessionId, 'sds_xau_series', 's1', 'sds_xau_sym', '1', 300] }));
        } catch {}
      });

      this.ws.on('message', (data: any) => {
        const str = data.toString();
        if (str.startsWith('~m~')) {
          const parts = str.split(/~m~\d+~m~/).filter(Boolean);
          for (const p of parts) {
            if (p.startsWith('~h~')) {
              try { this.ws.send(this.prep(p)); } catch {}
            } else {
              try {
                const msg = JSON.parse(p);
                if (msg.m === 'qsd') {
                  const sym = msg.p[1]?.n;
                  const v = msg.p[1]?.v;
                  if (sym === 'VANTAGE:XAUUSD' || (!this.lastQuote.price && sym === 'OANDA:XAUUSD')) {
                    if (v?.lp && Number.isFinite(v.lp)) this.lastQuote.price = v.lp;
                    else if ((!this.lastQuote.price || sym === 'VANTAGE:XAUUSD') && v?.bid && v?.ask && Number.isFinite(v.bid) && Number.isFinite(v.ask)) {
                      this.lastQuote.price = Math.round(((v.bid + v.ask) / 2) * 100) / 100;
                    }
                    if (v?.bid && Number.isFinite(v.bid)) this.lastQuote.bid = v.bid;
                    if (v?.ask && Number.isFinite(v.ask)) this.lastQuote.ask = v.ask;
                    if (this.lastQuote.price > 0) {
                      this.lastQuote.timestamp = Date.now();
                      this.broadcastQuote('XAUUSD', { ...this.lastQuote, symbol: 'XAUUSD' });
                    }
                  } else if (sym === 'PEPPERSTONE:NAS100' || (!this.lastNasQuote.price && sym === 'VANTAGE:NAS100')) {
                    if (v?.lp && Number.isFinite(v.lp)) this.lastNasQuote.price = v.lp;
                    else if ((!this.lastNasQuote.price || sym === 'PEPPERSTONE:NAS100') && v?.bid && v?.ask && Number.isFinite(v.bid) && Number.isFinite(v.ask)) {
                      this.lastNasQuote.price = Math.round(((v.bid + v.ask) / 2) * 10) / 10;
                    }
                    if (v?.bid && Number.isFinite(v.bid)) this.lastNasQuote.bid = v.bid;
                    if (v?.ask && Number.isFinite(v.ask)) this.lastNasQuote.ask = v.ask;
                    if (this.lastNasQuote.price > 0) {
                      this.lastNasQuote.timestamp = Date.now();
                      this.broadcastQuote('NAS100', { ...this.lastNasQuote, symbol: 'NAS100' });
                    }
                  }
                } else if (msg.m === 'timescale_update') {
                  const sNas = msg.p[1]?.sds_nas_series?.s;
                  if (Array.isArray(sNas) && sNas.length > 0) {
                    this.nasCandles = sNas.map((item: any) => [
                      item.v[0] * 1000,
                      item.v[1], // open
                      item.v[2], // high
                      item.v[3], // low
                      item.v[4], // close
                      item.v[5] || 10, // volume
                    ]);
                    const last = this.nasCandles[this.nasCandles.length - 1];
                    if (last) {
                      this.nasLiveCandle = {
                        time: Math.floor(last[0] / 1000),
                        open: last[1],
                        high: last[2],
                        low: last[3],
                        close: last[4],
                        volume: last[5],
                      };
                      this.broadcastCandle('NAS100', this.nasLiveCandle);
                    }
                  }

                  const sXau = msg.p[1]?.sds_xau_series?.s;
                  if (Array.isArray(sXau) && sXau.length > 0) {
                    this.xauCandles = sXau.map((item: any) => [
                      item.v[0] * 1000,
                      item.v[1], // open
                      item.v[2], // high
                      item.v[3], // low
                      item.v[4], // close
                      item.v[5] || 10, // volume
                    ]);
                    const last = this.xauCandles[this.xauCandles.length - 1];
                    if (last) {
                      this.xauLiveCandle = {
                        time: Math.floor(last[0] / 1000),
                        open: last[1],
                        high: last[2],
                        low: last[3],
                        close: last[4],
                        volume: last[5],
                      };
                      this.lastQuote.price = last[4];
                      this.lastQuote.timestamp = Date.now();
                      this.broadcastCandle('XAUUSD', this.xauLiveCandle);
                      this.broadcastQuote('XAUUSD', {
                        symbol: 'XAUUSD',
                        price: last[4],
                        bid: last[4] - 0.05,
                        ask: last[4] + 0.05,
                        timestamp: Date.now(),
                      });
                    }
                  }
                } else if (msg.m === 'du') {
                  const sNas = msg.p[1]?.sds_nas_series?.s;
                  if (Array.isArray(sNas) && sNas.length > 0) {
                    const item = sNas[sNas.length - 1];
                    const barTimeMs = item.v[0] * 1000;
                    const candle: TVLiveCandle = {
                      time: Math.floor(barTimeMs / 1000),
                      open: item.v[1],
                      high: item.v[2],
                      low: item.v[3],
                      close: item.v[4],
                      volume: item.v[5] || 10,
                    };
                    this.nasLiveCandle = candle;
                    if (this.nasCandles.length > 0) {
                      const lastBar = this.nasCandles[this.nasCandles.length - 1];
                      if (lastBar[0] === barTimeMs) {
                        this.nasCandles[this.nasCandles.length - 1] = [barTimeMs, candle.open, candle.high, candle.low, candle.close, candle.volume];
                      } else if (lastBar[0] < barTimeMs) {
                        this.nasCandles.push([barTimeMs, candle.open, candle.high, candle.low, candle.close, candle.volume]);
                        if (this.nasCandles.length > 500) this.nasCandles.shift();
                      }
                    }
                    this.broadcastCandle('NAS100', candle);
                  }

                  const sXau = msg.p[1]?.sds_xau_series?.s;
                  if (Array.isArray(sXau) && sXau.length > 0) {
                    const item = sXau[sXau.length - 1];
                    const barTimeMs = item.v[0] * 1000;
                    const candle: TVLiveCandle = {
                      time: Math.floor(barTimeMs / 1000),
                      open: item.v[1],
                      high: item.v[2],
                      low: item.v[3],
                      close: item.v[4],
                      volume: item.v[5] || 10,
                    };
                    this.xauLiveCandle = candle;
                    this.lastQuote.price = candle.close;
                    this.lastQuote.timestamp = Date.now();
                    if (this.xauCandles.length > 0) {
                      const lastBar = this.xauCandles[this.xauCandles.length - 1];
                      if (lastBar[0] === barTimeMs) {
                        this.xauCandles[this.xauCandles.length - 1] = [barTimeMs, candle.open, candle.high, candle.low, candle.close, candle.volume];
                      } else if (lastBar[0] < barTimeMs) {
                        this.xauCandles.push([barTimeMs, candle.open, candle.high, candle.low, candle.close, candle.volume]);
                        if (this.xauCandles.length > 500) this.xauCandles.shift();
                      }
                    }
                    this.broadcastCandle('XAUUSD', candle);
                    this.broadcastQuote('XAUUSD', {
                      symbol: 'XAUUSD',
                      price: candle.close,
                      bid: candle.close - 0.05,
                      ask: candle.close + 0.05,
                      timestamp: Date.now(),
                    });
                  }
                }
              } catch {}
            }
          }
        }
      });

      this.ws.on('close', () => {
        this.isConnecting = false;
        setTimeout(() => this.connect(), 2000)?.unref?.();
      });

      this.ws.on('error', () => {
        this.isConnecting = false;
        try { this.ws?.close(); } catch {}
      });
    } catch {
      this.isConnecting = false;
    }
  }

  private aggregateBars(candles: any[], tfSec: number): any[] | null {
    if (!candles || candles.length === 0) return null;
    const groupMap = new Map<number, any>();
    for (const k of candles) {
      const tSec = Math.floor(k[0] / 1000);
      const barStart = Math.floor(tSec / tfSec) * tfSec;
      const open = k[1];
      const high = k[2];
      const low = k[3];
      const close = k[4];
      const vol = k[5] || 0;
      if (!groupMap.has(barStart)) {
        groupMap.set(barStart, {
          time: barStart * 1000,
          open,
          high,
          low,
          close,
          volume: vol,
        });
      } else {
        const cur = groupMap.get(barStart);
        cur.high = Math.max(cur.high, high);
        cur.low = Math.min(cur.low, low);
        cur.close = close;
        cur.volume += vol;
      }
    }
    return Array.from(groupMap.values())
      .sort((a, b) => a.time - b.time)
      .map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume]);
  }

  public async fetchHistoricalBars(timeframe: string, limit: number = 300, symbol: string = 'VANTAGE:XAUUSD'): Promise<any[] | null> {
    const isNas = symbol.includes('NAS100');
    const isGold = symbol.includes('XAU') || symbol.includes('GOLD');

    const resSecMap: Record<string, number> = {
      '1m': 60,
      '1': 60,
      '3m': 180,
      '3': 180,
      '5m': 300,
      '5': 300,
      '15m': 900,
      '15': 900,
      '30m': 1800,
      '30': 1800,
      '1h': 3600,
      '60': 3600,
      '2h': 7200,
      '120': 7200,
      '4h': 14400,
      '240': 14400,
      '1d': 86400,
      'D': 86400,
    };

    // Instant 0ms memory cache for Nasdaq
    if (isNas && this.nasCandles.length >= 50) {
      if (timeframe === '1m' || timeframe === '1') {
        return limit > 0 ? this.nasCandles.slice(-limit) : this.nasCandles;
      }
      const tfSec = resSecMap[timeframe];
      if (tfSec) {
        const aggregated = this.aggregateBars(this.nasCandles, tfSec);
        if (aggregated && aggregated.length > 0) {
          return limit > 0 ? aggregated.slice(-limit) : aggregated;
        }
      }
    }

    // Instant 0ms memory cache for Gold
    if (isGold && this.xauCandles.length >= 50) {
      if (timeframe === '1m' || timeframe === '1') {
        return limit > 0 ? this.xauCandles.slice(-limit) : this.xauCandles;
      }
      const tfSec = resSecMap[timeframe];
      if (tfSec) {
        const aggregated = this.aggregateBars(this.xauCandles, tfSec);
        if (aggregated && aggregated.length > 0) {
          return limit > 0 ? aggregated.slice(-limit) : aggregated;
        }
      }
    }

    return new Promise((resolve) => {
      let resolved = false;
      const resMap: Record<string, string> = {
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
      const resolution = resMap[timeframe] || '1';

      try {
        const tempWs = new WebSocket('wss://data.tradingview.com/socket.io/websocket', {
          headers: {
            'Origin': 'https://www.tradingview.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const cs = 'cs_' + Math.random().toString(36).substring(2, 10);

        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            try { tempWs.close(); } catch {}
            resolve(null);
          }
        }, 3500);

        tempWs.on('open', () => {
          try {
            tempWs.send(this.prep({ m: 'set_auth_token', p: ['unauthorized_user_token'] }));
            tempWs.send(this.prep({ m: 'chart_create_session', p: [cs, ''] }));
            tempWs.send(this.prep({ m: 'resolve_symbol', p: [cs, 'sds_sym_1', '={"symbol":"' + symbol + '","adjustment":"splits"}'] }));
            tempWs.send(this.prep({ m: 'create_series', p: [cs, 'sds_1', 's1', 'sds_sym_1', resolution, limit] }));
          } catch {}
        });

        tempWs.on('message', (data: any) => {
          const str = data.toString();
          if (str.startsWith('~m~')) {
            const parts = str.split(/~m~\d+~m~/).filter(Boolean);
            for (const p of parts) {
              if (p.startsWith('~h~')) {
                try { tempWs.send(this.prep(p)); } catch {}
              } else {
                try {
                  const msg = JSON.parse(p);
                  if (msg.m === 'timescale_update') {
                    const s = msg.p[1]?.sds_1?.s;
                    if (Array.isArray(s) && s.length > 0) {
                      if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        try { tempWs.close(); } catch {}
                        const candles = s.map((item: any) => [
                          item.v[0] * 1000,
                          item.v[1], // open
                          item.v[2], // high
                          item.v[3], // low
                          item.v[4], // close
                          item.v[5] || 10, // volume
                        ]);
                        resolve(candles);
                        return;
                      }
                    }
                  }
                } catch {}
              }
            }
          }
        });

        tempWs.on('error', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(null);
          }
        });
      } catch {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }
    });
  }
}

export const tvBridge = new TradingViewBridge();
