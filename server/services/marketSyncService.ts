/**
 * JARVIS Market Sync & Ingestion Service
 * Connects upstream exchange APIs, SQLite durable store, and Redis hot cache.
 */

import { sqliteStore, StoredCandle } from '../db/sqliteStore.js';
import { hotCache } from '../cache/redisClient.js';

export interface CandleQueryOptions {
  symbol: string;
  timeframe: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  forceRefresh?: boolean;
}

export class MarketSyncService {
  private activeSyncInterval: NodeJS.Timeout | null = null;
  private isPrewarmed = false;

  async init(): Promise<void> {
    await sqliteStore.init();
    this.startBackgroundSync();
  }

  private getYahooSymbol(cleanSym: string): string {
    const s = cleanSym.toUpperCase().replace(/[-_/]/g, '');
    if (s.startsWith('BTC')) return 'BTC-USD';
    if (s.startsWith('ETH')) return 'ETH-USD';
    if (s.startsWith('SOL')) return 'SOL-USD';
    if (s.startsWith('BNB')) return 'BNB-USD';
    if (s === 'EURUSD' || s === 'EUR' || s === 'EURUSDT') return 'EURUSD=X';
    if (s === 'GBPUSD' || s === 'GBP' || s === 'GBPUSDT') return 'GBPUSD=X';
    if (s === 'GC' || s === 'CME' || s === 'COMEX') return 'GC=F';
    if (s.startsWith('XAU') || s.startsWith('GOLD') || s === 'VANTAGE' || s === 'OANDA') return 'GC=F';
    return `${s}-USD`;
  }

  /**
   * Pre-warm benchmark instruments and keep fresh in background
   */
  private startBackgroundSync(): void {
    if (this.isPrewarmed) return;
    this.isPrewarmed = true;

    // Initial pre-warm after 500ms
    setTimeout(async () => {
      try {
        const prewarmSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'GC', 'XAUUSDT'];
        const intervals = ['1m', '5m', '15m', '1h', '1d'];
        for (const sym of prewarmSymbols) {
          for (const tf of intervals) {
            await this.fetchAndStoreUpstream(sym, tf, 300).catch(() => {});
          }
        }
        console.log('[MarketSyncService] Initial pre-warm complete: benchmarks stored in SQLite & Hot Cache.');
      } catch (err) {
        console.warn('[MarketSyncService] Pre-warm failed:', err);
      }
    }, 500);

    // Continuous background sync every 30 seconds for active candles (gentle for cloud deployment)
    this.activeSyncInterval = setInterval(async () => {
      try {
        await Promise.allSettled([
          this.fetchAndStoreUpstream('BTCUSDT', '1m', 10),
          this.fetchAndStoreUpstream('ETHUSDT', '1m', 10),
          this.fetchAndStoreUpstream('SOLUSDT', '1m', 10),
          this.fetchAndStoreUpstream('XAUUSDT', '1m', 10),
        ]);
      } catch {}
    }, 30000);
  }

  /**
   * Primary query method: Redis -> SQLite -> Upstream Fetch -> SQLite + Redis
   */
  async getCandles(options: CandleQueryOptions): Promise<StoredCandle[]> {
    const symbol = (options.symbol || 'BTCUSDT').toUpperCase().replace(/[-_/]/g, '');
    const timeframe = (options.timeframe || '1m').toLowerCase();
    const limit = Math.min(Math.max(1, options.limit || 300), 1000);
    const { startTime, endTime, forceRefresh } = options;

    const cacheKey = `klines_${symbol}_${timeframe}_${startTime || 0}_${endTime || 0}_${limit}`;

    // 1. Tier 1: Check Redis Hot Cache (unless forceRefresh)
    if (!forceRefresh) {
      const cached = await hotCache.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {}
      }
    }

    // 2. Tier 2: Check SQLite Durable Store
    let stored = sqliteStore.getCandles(symbol, timeframe, startTime, endTime, limit);

    // If SQLite has sufficient candles or we are querying bounded historical slice, return
    if (stored.length >= Math.min(limit, 250) && !forceRefresh) {
      await hotCache.set(cacheKey, JSON.stringify(stored), 4);
      return stored;
    }

    // 3. Tier 3: Fetch from Upstream Exchange and persist
    try {
      const fresh = await this.fetchAndStoreUpstream(symbol, timeframe, Math.max(limit, 300), endTime);
      if (fresh.length > 0) {
        stored = sqliteStore.getCandles(symbol, timeframe, startTime, endTime, limit);
        if (stored.length > 0) {
          await hotCache.set(cacheKey, JSON.stringify(stored), 4);
          return stored;
        }
        await hotCache.set(cacheKey, JSON.stringify(fresh.slice(-limit)), 4);
        return fresh.slice(-limit);
      }
    } catch (err) {
      console.warn(`[MarketSyncService] Upstream fetch error for ${symbol} ${timeframe}:`, err);
    }

    return stored;
  }

  /**
   * Fetch from authoritative upstream sources (Coinbase, Bybit, Yahoo Finance, Binance Vision) and store in SQLite
   */
  async fetchAndStoreUpstream(symbol: string, timeframe: string, limit: number = 300, _endTime?: number): Promise<StoredCandle[]> {
    const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
    const tf = timeframe.toLowerCase();
    const baseCrypto = sym.replace(/USDT$/, '').replace(/USD$/, '');

    // 1. Crypto (BTC, ETH, SOL): Coinbase REST API (100% US & Cloud Friendly, authentic MT5 USD spot)
    if (baseCrypto === 'BTC' || baseCrypto === 'ETH' || baseCrypto === 'SOL') {
      try {
        const gran = tf === '1d' ? 86400 : tf === '1h' ? 3600 : tf === '15m' ? 900 : tf === '5m' ? 300 : 60;
        const res = await fetch(`https://api.exchange.coinbase.com/products/${baseCrypto}-USD/candles?granularity=${gran}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 JARVIS-Trading-Terminal/2.0' },
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const cbList: any = await res.json();
          if (Array.isArray(cbList) && cbList.length > 0) {
            // Coinbase format: [time_sec, low, high, open, close, volume]
            const sorted = [...cbList].sort((a, b) => a[0] - b[0]);
            const candles: StoredCandle[] = sorted.map((k) => ({
              time: k[0],
              open: parseFloat(k[3]),
              high: parseFloat(k[2]),
              low: parseFloat(k[1]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5] || 0),
            }));
            sqliteStore.insertCandles(sym, tf, candles);
            if (sym !== `${baseCrypto}USDT`) {
              sqliteStore.insertCandles(`${baseCrypto}USDT`, tf, candles);
            }
            const proxyKey = `klines_raw_${sym}_${tf}`;
            await hotCache.set(proxyKey, JSON.stringify(candles.map(c => [c.time * 1000, c.open, c.high, c.low, c.close, c.volume])), 5);
            return candles;
          }
        }
      } catch (err) {
        console.warn(`[MarketSyncService] Coinbase fetch failed for ${baseCrypto}:`, err);
      }
    }

    // 2. BNB: Bybit Spot API
    if (baseCrypto === 'BNB') {
      try {
        const byInterval = tf === '1d' ? 'D' : tf === '1h' ? '60' : tf === '15m' ? '15' : tf === '5m' ? '5' : '1';
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=BNBUSDT&interval=${byInterval}&limit=${Math.min(limit, 300)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 JARVIS-Trading-Terminal/2.0' },
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const json: any = await res.json();
          const bbList = json?.result?.list;
          if (Array.isArray(bbList) && bbList.length > 0) {
            const sorted = [...bbList].sort((a, b) => Number(a[0]) - Number(b[0]));
            const candles: StoredCandle[] = sorted.map((k) => ({
              time: Math.floor(Number(k[0]) / 1000),
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5] || 0),
            }));
            sqliteStore.insertCandles(sym, tf, candles);
            sqliteStore.insertCandles('BNBUSDT', tf, candles);
            return candles;
          }
        }
      } catch {}
    }

    // 3. Gold & Forex: Yahoo Finance query1
    const isComex = sym === 'GC' || sym.startsWith('COMEX') || sym === 'CME';
    const isGoldSpot = sym.startsWith('XAU') || sym.startsWith('GOLD') || sym === 'VANTAGE' || sym === 'OANDA';
    const isFx = sym.startsWith('EUR') || sym.startsWith('GBP');

    if (isComex || isGoldSpot || isFx) {
      try {
        const yInterval = tf === '1d' ? '1d' : tf === '1h' ? '60m' : tf === '15m' ? '15m' : tf === '5m' ? '5m' : '1m';
        const yahooSym = this.getYahooSymbol(sym);
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${yInterval}&range=2d`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const json: any = await res.json();
          const result = json?.chart?.result?.[0];
          const timestamps = result?.timestamp || [];
          const quotes = result?.indicators?.quote?.[0];
          if (quotes && timestamps.length > 0) {
            const candles: StoredCandle[] = [];
            for (let i = 0; i < timestamps.length; i++) {
              const t = timestamps[i];
              const o = quotes.open[i];
              const h = quotes.high[i];
              const l = quotes.low[i];
              const c = quotes.close[i];
              const v = quotes.volume?.[i] ?? 100;
              if (o === null || h === null || l === null || c === null) continue;
              let adjO = o;
              let adjH = h;
              let adjL = l;
              let adjC = c;
              if (isGoldSpot) {
                adjO = Math.round((o - 12.50) * 100) / 100;
                adjH = Math.round((h - 12.50) * 100) / 100;
                adjL = Math.round((l - 12.50) * 100) / 100;
                adjC = Math.round((c - 12.50) * 100) / 100;
              }
              candles.push({ time: t, open: adjO, high: adjH, low: adjL, close: adjC, volume: v });
            }
            if (candles.length > 0) {
              sqliteStore.insertCandles(sym, tf, candles);
              return candles;
            }
          }
        }
      } catch {}
    }

    // 4. Secondary fallback: Binance Vision
    try {
      const targetSym = (sym.startsWith('XAU') || sym.startsWith('GOLD')) ? 'PAXGUSDT' : sym;
      const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${targetSym}&interval=${tf}&limit=${Math.min(limit, 1000)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const rawData = (await res.json()) as any[][];
        if (Array.isArray(rawData) && rawData.length > 0) {
          const candles: StoredCandle[] = rawData.map((k) => ({
            time: Math.floor(Number(k[0]) / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
          sqliteStore.insertCandles(sym, tf, candles);
          return candles;
        }
      }
    } catch {}

    return [];
  }

  /**
   * Drop-in compatible raw format handler for `/api/cache/klines`
   */
  async getRawKlines(symbol: string, interval: string, limit: number = 1000): Promise<any[][] | null> {
    const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
    const tf = interval.toLowerCase();
    const proxyKey = `klines_raw_${sym}_${tf}`;

    // 1. Hot cache
    const cached = await hotCache.get(proxyKey);
    if (cached) {
      try {
        const raw = JSON.parse(cached);
        if (Array.isArray(raw)) {
          return limit > 0 && limit < raw.length ? raw.slice(-limit) : raw;
        }
      } catch {}
    }

    // 2. Query SQLite and convert to array format: [timeMs, open, high, low, close, volume, ...]
    const stored = sqliteStore.getCandles(sym, tf, undefined, undefined, limit);
    if (stored.length > 0) {
      const raw = stored.map((c) => [
        c.time * 1000,
        c.open.toString(),
        c.high.toString(),
        c.low.toString(),
        c.close.toString(),
        c.volume.toString(),
        (c.time + 60) * 1000,
        '0',
        0,
        '0',
        '0',
        '0',
      ]);
      await hotCache.set(proxyKey, JSON.stringify(raw), 4);
      return raw;
    }

    // 3. Upstream fetch
    try {
      await this.fetchAndStoreUpstream(sym, tf, limit);
      const afterFetch = await hotCache.get(proxyKey);
      if (afterFetch) {
        return JSON.parse(afterFetch);
      }
    } catch {}

    return null;
  }

  /**
   * Fast Ticker Price Handler (Coinbase, Bybit, Yahoo, Binance Vision)
   */
  async getTickerPrice(symbol: string): Promise<{ symbol: string; price: number; timestamp: number } | null> {
    const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
    const key = `ticker_${sym}`;

    const cached = await hotCache.get(key);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }

    const baseCrypto = sym.replace(/USDT$/, '').replace(/USD$/, '');

    // 1. Crypto (BTC, ETH, SOL): Coinbase Spot
    if (baseCrypto === 'BTC' || baseCrypto === 'ETH' || baseCrypto === 'SOL') {
      try {
        const res = await fetch(`https://api.coinbase.com/v2/prices/${baseCrypto}-USD/spot`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const amt = parseFloat(json?.data?.amount);
          if (Number.isFinite(amt) && amt > 0) {
            const result = { symbol: sym, price: Math.round(amt * 100) / 100, timestamp: Date.now() };
            await hotCache.set(key, JSON.stringify(result), 2);
            return result;
          }
        }
      } catch {}
    }

    // 2. BNB: Bybit Spot
    if (baseCrypto === 'BNB') {
      try {
        const res = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BNBUSDT', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const p = parseFloat(json?.result?.list?.[0]?.lastPrice);
          if (Number.isFinite(p) && p > 0) {
            const result = { symbol: sym, price: Math.round(p * 100) / 100, timestamp: Date.now() };
            await hotCache.set(key, JSON.stringify(result), 2);
            return result;
          }
        }
      } catch {}
    }

    // 3. Gold & Forex: Yahoo Finance query1
    try {
      const yahooSym = this.getYahooSymbol(sym);
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const json: any = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          let price = meta.regularMarketPrice;
          const isGoldSpot = sym.startsWith('XAU') || sym.startsWith('GOLD') || sym === 'VANTAGE' || sym === 'OANDA';
          if (isGoldSpot) {
            price = Math.round((price - 12.50) * 100) / 100;
          }
          const mult = sym.includes('EUR') || sym.includes('GBP') ? 10000 : (sym === 'GC' ? 10 : 100);
          const finalPrice = Math.round(price * mult) / mult;
          const result = { symbol: sym, price: finalPrice, timestamp: Date.now() };
          await hotCache.set(key, JSON.stringify(result), 2);
          return result;
        }
      }
    } catch {}

    // 4. Fallback: Binance Vision
    try {
      const targetSym = (sym.startsWith('XAU') || sym.startsWith('GOLD')) ? 'PAXGUSDT' : sym;
      const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${targetSym}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const data: any = await res.json();
        const rawPrice = parseFloat(data.price);
        if (Number.isFinite(rawPrice) && rawPrice > 0) {
          const result = { symbol: sym, price: rawPrice, timestamp: Date.now() };
          await hotCache.set(key, JSON.stringify(result), 2);
          return result;
        }
      }
    } catch {}

    return null;
  }

  close(): void {
    if (this.activeSyncInterval) {
      clearInterval(this.activeSyncInterval);
      this.activeSyncInterval = null;
    }
  }
}

export const marketSyncService = new MarketSyncService();
