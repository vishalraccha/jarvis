/**
 * JARVIS Market Sync & Ingestion Service
 * Connects upstream exchange APIs, SQLite durable store, and Redis hot cache.
 * Provides authentic OHLCV klines and tickers for Crypto, COMEX, and Forex.
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
   * Fetch from authoritative upstream sources and store in SQLite
   */
  async fetchAndStoreUpstream(symbol: string, timeframe: string, limit: number = 300, endTime?: number): Promise<StoredCandle[]> {
    const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
    const tf = timeframe.toLowerCase();

    // 1. Forex and COMEX Gold Futures
    if (sym === 'GC' || sym.startsWith('COMEX') || sym === 'CME' || sym === 'EURUSD' || sym === 'GBPUSD') {
      const isComex = sym === 'GC' || sym.startsWith('COMEX') || sym === 'CME';
      const yahooSym = isComex ? 'GC=F' : `${sym}=X`;
      const yInterval = tf === '1d' ? '1d' : tf === '1h' ? '60m' : tf === '15m' ? '15m' : tf === '5m' ? '5m' : '1m';

      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${yInterval}&range=2d`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(4000),
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
              const v = quotes.volume?.[i] ?? (isComex ? 100 : 1000);
              if (o === null || h === null || l === null || c === null) continue;
              candles.push({ time: t, open: o, high: h, low: l, close: c, volume: v });
            }
            if (candles.length > 0) {
              sqliteStore.insertCandles(sym, tf, candles);
              const proxyKey = `klines_raw_${sym}_${tf}`;
              await hotCache.set(proxyKey, JSON.stringify(candles.map(c => [c.time * 1000, c.open, c.high, c.low, c.close, c.volume])), 5);
              return candles;
            }
          }
        }
      } catch (err) {
        console.warn(`[MarketSyncService] Yahoo fetch failed for ${sym}:`, err);
      }
    }

    // 2. Binance Spot & Futures Pipeline
    const isGoldSpot = sym.startsWith('XAU') || sym.startsWith('GOLD') || sym === 'VANTAGE' || sym === 'OANDA';
    const isFutures = isGoldSpot || sym.includes('PERP') || sym.includes('FUTURES');
    let targetSym = sym;
    if (isGoldSpot) {
      targetSym = 'XAUUSDT';
    }

    let endpoint = isFutures
      ? `https://fapi.binance.com/fapi/v1/klines?symbol=${targetSym}&interval=${tf}&limit=${Math.min(limit, 1000)}`
      : `https://api.binance.com/api/v3/klines?symbol=${targetSym}&interval=${tf}&limit=${Math.min(limit, 1000)}`;

    if (endTime && Number.isFinite(endTime) && endTime > 0) {
      endpoint += `&endTime=${Math.floor(endTime * 1000)}`;
    }

    let rawData: any[][] | null = null;

    try {
      const res = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0 JARVIS-Trading-Terminal/2.0' },
        signal: AbortSignal.timeout(4500),
      });

      if (res.ok) {
        rawData = (await res.json()) as any[][];
      } else if (!isFutures && (res.status === 451 || res.status === 403)) {
        // Fallback for cloud hosts (e.g. Render US IP blocked by standard api.binance.com)
        const visionEndpoint = endpoint.replace('api.binance.com', 'data-api.binance.vision');
        const fallbackRes = await fetch(visionEndpoint, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4500),
        });
        if (fallbackRes.ok) {
          rawData = (await fallbackRes.json()) as any[][];
        }
      }
    } catch {
      if (!isFutures) {
        try {
          const visionEndpoint = endpoint.replace('api.binance.com', 'data-api.binance.vision');
          const fallbackRes = await fetch(visionEndpoint, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(4500),
          });
          if (fallbackRes.ok) {
            rawData = (await fallbackRes.json()) as any[][];
          }
        } catch {}
      }
    }

    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    let goldBasis = 0;
    if (isGoldSpot && rawData.length > 0) {
      try {
        const spotRes = await fetch('https://api.goldprice.dev/v1/spot/XAU-USD-SPOT', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(2500),
        });
        if (spotRes.ok) {
          const spotJson: any = await spotRes.json();
          const spotP = parseFloat(spotJson?.price);
          const rawLast = parseFloat(rawData[rawData.length - 1][4]);
          if (spotP > 1000 && rawLast > 1000) {
            goldBasis = Math.round((rawLast - spotP) * 100) / 100;
          }
        }
      } catch {}
    }

    const mult = 100;

    const candles: StoredCandle[] = rawData.map((k) => {
      const open = Math.round((parseFloat(k[1]) - goldBasis) * mult) / mult;
      const rawHigh = Math.round((parseFloat(k[2]) - goldBasis) * mult) / mult;
      const rawLow = Math.round((parseFloat(k[3]) - goldBasis) * mult) / mult;
      const close = Math.round((parseFloat(k[4]) - goldBasis) * mult) / mult;
      const high = Math.max(open, rawHigh, rawLow, close);
      const low = Math.min(open, rawHigh, rawLow, close);
      return {
        time: Math.floor(Number(k[0]) / 1000),
        open,
        high,
        low,
        close,
        volume: parseFloat(k[5]),
      };
    });

    sqliteStore.insertCandles(sym, tf, candles);
    if (targetSym !== sym) {
      sqliteStore.insertCandles(targetSym, tf, candles);
    }

    const proxyKey = `klines_raw_${sym}_${tf}`;
    await hotCache.set(proxyKey, JSON.stringify(rawData), 5);

    return candles;
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
   * Fast Ticker Price Handler
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

    // 1. Gold & Forex: Yahoo Finance
    if (sym === 'GC' || sym.startsWith('COMEX') || sym === 'CME' || sym === 'EURUSD' || sym === 'GBPUSD') {
      try {
        const yahooSym = this.getYahooSymbol(sym);
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(2500),
        });
        if (res.ok) {
          const json: any = await res.json();
          const meta = json?.chart?.result?.[0]?.meta;
          if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
            const mult = sym.includes('EUR') || sym.includes('GBP') ? 10000 : (sym === 'GC' ? 10 : 100);
            const finalPrice = Math.round(meta.regularMarketPrice * mult) / mult;
            const result = { symbol: sym, price: finalPrice, timestamp: Date.now() };
            await hotCache.set(key, JSON.stringify(result), 2);
            return result;
          }
        }
      } catch {}
    }

    // 2. Binance Spot & Futures
    const isGold = sym.startsWith('XAU') || sym.startsWith('GOLD');
    const isFutures = sym.includes('PERP') || isGold;
    const targetSym = isGold ? 'XAUUSDT' : sym;
    const baseUrl = isFutures ? 'https://fapi.binance.com/fapi/v1/ticker/price' : 'https://api.binance.com/api/v3/ticker/price';

    try {
      let res = await fetch(`${baseUrl}?symbol=${targetSym}`, {
        signal: AbortSignal.timeout(2500),
      });

      if (!res.ok && !isFutures) {
        res = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${targetSym}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(2000),
        });
      }

      if (res.ok) {
        const data = (await res.json()) as { symbol: string; price: string };
        const rawPrice = parseFloat(data.price);
        if (Number.isFinite(rawPrice) && rawPrice > 0) {
          const finalPrice = Math.round(rawPrice * 100) / 100;
          const result = {
            symbol: sym,
            price: finalPrice,
            timestamp: Date.now(),
          };
          await hotCache.set(key, JSON.stringify(result), 2);
          return result;
        }
      }
    } catch {
      if (!isFutures) {
        try {
          const fallbackRes = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${targetSym}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(2000),
          });
          if (fallbackRes.ok) {
            const data = (await fallbackRes.json()) as { symbol: string; price: string };
            const rawPrice = parseFloat(data.price);
            if (Number.isFinite(rawPrice) && rawPrice > 0) {
              const result = { symbol: sym, price: Math.round(rawPrice * 100) / 100, timestamp: Date.now() };
              await hotCache.set(key, JSON.stringify(result), 2);
              return result;
            }
          }
        } catch {}
      }
    }

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
