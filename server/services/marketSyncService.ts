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

  /**
   * Pre-warm benchmark instruments and keep fresh in background
   */
  private startBackgroundSync(): void {
    if (this.isPrewarmed) return;
    this.isPrewarmed = true;

    // Initial pre-warm after 500ms
    setTimeout(async () => {
      try {
        const prewarmSymbols = ['XAUUSDT', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
        const intervals = ['1m', '5m', '15m', '1h', '1d'];
        for (const sym of prewarmSymbols) {
          for (const tf of intervals) {
            await this.fetchAndStoreUpstream(sym, tf, 500).catch(() => {});
          }
        }
        console.log('[MarketSyncService] Initial pre-warm complete: benchmarks stored in SQLite & Hot Cache.');
      } catch (err) {
        console.warn('[MarketSyncService] Pre-warm failed:', err);
      }
    }, 500);

    // Continuous background sync every 3000ms for active 1m/5m candles
    this.activeSyncInterval = setInterval(async () => {
      try {
        await Promise.allSettled([
          this.fetchAndStoreUpstream('XAUUSDT', '1m', 10),
          this.fetchAndStoreUpstream('BTCUSDT', '1m', 10),
          this.fetchAndStoreUpstream('ETHUSDT', '1m', 10),
        ]);
      } catch {}
    }, 3000);
  }

  /**
   * Primary query method: Redis -> SQLite -> Upstream Fetch -> SQLite + Redis
   */
  async getCandles(options: CandleQueryOptions): Promise<StoredCandle[]> {
    const symbol = (options.symbol || 'XAUUSDT').toUpperCase().replace(/[-_/]/g, '');
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
      const fresh = await this.fetchAndStoreUpstream(symbol, timeframe, Math.max(limit, 500), endTime);
      if (fresh.length > 0) {
        // Re-query from SQLite with exact user filters
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
   * Fetch from upstream exchange (Binance Futures / Spot / Yahoo) and store in SQLite
   */
  async fetchAndStoreUpstream(symbol: string, timeframe: string, limit: number = 500, endTime?: number): Promise<StoredCandle[]> {
    const sym = symbol.toUpperCase().replace(/[-_/]/g, '');
    const tf = timeframe.toLowerCase();

    // Map symbol to exchange source
    const isCrypto = sym.endsWith('USDT') || sym.startsWith('BTC') || sym.startsWith('ETH') || sym.startsWith('SOL');
    const isFutures = isCrypto && !sym.includes('SPOT');

    let endpoint = isFutures
      ? `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=${Math.min(limit, 1000)}`
      : `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${Math.min(limit, 1000)}`;

    // Fallback for gold symbols if needed
    if (sym === 'XAUUSD' || sym === 'XAUUSDVANTAGE') {
      endpoint = `https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=${tf}&limit=${Math.min(limit, 1000)}`;
    }

    if (endTime && Number.isFinite(endTime) && endTime > 0) {
      endpoint += `&endTime=${Math.floor(endTime * 1000)}`;
    }

    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'Mozilla/5.0 JARVIS-Trading-Terminal/2.0' },
      signal: AbortSignal.timeout(4500),
    });

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status}: ${res.statusText}`);
    }

    const rawData = (await res.json()) as any[][];
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    const candles: StoredCandle[] = rawData.map((k) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    // Insert into SQLite
    sqliteStore.insertCandles(sym, tf, candles);

    // Cache latest 1000 in Redis hot cache for drop-in proxy compatibility
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

    // 2. Query SQLite and convert to Binance array format: [timeMs, open, high, low, close, volume, ...]
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

    // Fetch from Binance
    const isCrypto = sym.endsWith('USDT') || sym.startsWith('BTC') || sym.startsWith('ETH');
    const baseUrl = isCrypto ? 'https://fapi.binance.com/fapi/v1/ticker/price' : 'https://api.binance.com/api/v3/ticker/price';

    try {
      const targetSym = (sym === 'XAUUSD' || sym === 'XAUUSDVANTAGE') ? 'XAUUSDT' : sym;
      const res = await fetch(`${baseUrl}?symbol=${targetSym}`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const data = (await res.json()) as { symbol: string; price: string };
        const result = {
          symbol: sym,
          price: parseFloat(data.price),
          timestamp: Date.now(),
        };
        await hotCache.set(key, JSON.stringify(result), 2); // 2s TTL for ticker
        return result;
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
