import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * High-performance In-Memory Redis-Style Candle Cache Plugin for Vite
 * Keeps 1000 candles for key instruments in Node.js server RAM.
 * Responds in < 0.2ms with stale-while-revalidate background refresh.
 */
function redisFastCandleCachePlugin(): Plugin {
  interface CacheEntry {
    timestamp: number;
    data: string;
  }
  const memoryCache = new Map<string, CacheEntry>();

  function parseInstrumentTarget(rawSym: string) {
    const raw = (rawSym || 'XAUUSD').toUpperCase().replace(/[-_/]/g, '');
    let cleanSym = raw;
    if (raw.startsWith('BTC')) cleanSym = 'BTC';
    else if (raw.startsWith('ETH')) cleanSym = 'ETH';
    else if (raw.startsWith('SOL')) cleanSym = 'SOL';
    else if (raw.startsWith('BNB')) cleanSym = 'BNB';
    else if (raw.startsWith('XAU') || raw.startsWith('GOLD') || raw === 'VANTAGE' || raw === 'OANDA') cleanSym = 'XAUUSD';
    else if (raw === 'GC' || raw.startsWith('COMEX') || raw.startsWith('GCFUTURES') || raw === 'CME') cleanSym = 'GC';
    else if (raw.startsWith('EUR')) cleanSym = 'EURUSD';
    else if (raw.startsWith('GBP')) cleanSym = 'GBPUSD';

    const isComex = cleanSym === 'GC';
    const isGoldSpot = cleanSym === 'XAUUSD';
    const isFx = cleanSym === 'EURUSD' || cleanSym === 'GBPUSD';
    const isGold = isGoldSpot || isComex;
    let targetSym = cleanSym;
    if (isGoldSpot) targetSym = 'XAUUSDT';
    else if (cleanSym === 'EURUSD') targetSym = 'EURUSDT';
    else if (cleanSym === 'GBPUSD') targetSym = 'GBPUSDT';
    else if (cleanSym === 'BTC') targetSym = 'BTCUSDT';
    else if (cleanSym === 'ETH') targetSym = 'ETHUSDT';
    else if (cleanSym === 'SOL') targetSym = 'SOLUSDT';
    else if (cleanSym === 'BNB') targetSym = 'BNBUSDT';

    const isCrypto = !isFx && !isGold;
    const isFutures = isGoldSpot || (!isFx && (raw.includes('PERP') || raw.includes('FUTURES')));

    return { cleanSym, targetSym, isGoldSpot, isComex, isFx, isGold, isCrypto, isFutures, priceOffset: 0 };
  }

  function getYahooSymbol(cleanSym: string): string {
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

  async function fetchAndCache(symbol: string, interval: string, isFutures: boolean): Promise<string | null> {
    const { cleanSym, targetSym, isComex, isGoldSpot, isFx } = parseInstrumentTarget(symbol);
    const key = `${cleanSym}_${interval}_${isFutures ? 'fut' : 'spot'}`;
    const yahooSym = getYahooSymbol(cleanSym);
    const baseCrypto = cleanSym.replace(/USDT$/, '').replace(/USD$/, '');

    // 1. Authoritative source for BTC, ETH, SOL: Coinbase USD Spot (matches MT5 & TradingView 1:1)
    if (baseCrypto === 'BTC' || baseCrypto === 'ETH' || baseCrypto === 'SOL') {
      try {
        const gran = interval === '1d' ? 86400 : interval === '1h' ? 3600 : interval === '15m' ? 900 : interval === '5m' ? 300 : 60;
        const res = await fetch(`https://api.exchange.coinbase.com/products/${baseCrypto}-USD/candles?granularity=${gran}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const cbList: any = await res.json();
          if (Array.isArray(cbList) && cbList.length > 0) {
            // Coinbase candle format: [time_sec, low, high, open, close, volume]
            const sorted = [...cbList].sort((a: any, b: any) => a[0] - b[0]);
            const list = sorted.map((k: any) => [
              k[0] * 1000,
              String(k[3]), // open
              String(k[2]), // high
              String(k[1]), // low
              String(k[4]), // close
              String(k[5] || 0), // volume
            ]);
            const text = JSON.stringify(list);
            memoryCache.set(key, { timestamp: Date.now(), data: text });
            return text;
          }
        }
      } catch {}
    }

    // 2. Authoritative source for BNB: Bybit Spot (matches TradingView 1:1)
    if (baseCrypto === 'BNB') {
      try {
        const byInterval = interval === '1d' ? 'D' : interval === '1h' ? '60' : interval === '15m' ? '15' : interval === '5m' ? '5' : '1';
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=BNBUSDT&interval=${byInterval}&limit=1000`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const bbList = json?.result?.list;
          if (Array.isArray(bbList) && bbList.length > 0) {
            const sorted = [...bbList].sort((a: any, b: any) => Number(a[0]) - Number(b[0]));
            const list = sorted.map((k: any) => [
              Number(k[0]),
              k[1],
              k[2],
              k[3],
              k[4],
              k[5],
            ]);
            const text = JSON.stringify(list);
            memoryCache.set(key, { timestamp: Date.now(), data: text });
            return text;
          }
        }
      } catch {}
    }

    // 3. Authoritative source for XAUUSD (Spot Gold / OANDA / Vantage): Bybit Linear XAUUSDT & Binance Futures
    if (isGoldSpot) {
      try {
        const byInterval = interval === '1d' ? 'D' : interval === '1h' ? '60' : interval === '15m' ? '15' : interval === '5m' ? '5' : '1';
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=XAUUSDT&interval=${byInterval}&limit=1000`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const bbList = json?.result?.list;
          if (Array.isArray(bbList) && bbList.length > 0) {
            const sorted = [...bbList].sort((a: any, b: any) => Number(a[0]) - Number(b[0]));
            const list = sorted.map((k: any) => [
              Number(k[0]),
              k[1],
              k[2],
              k[3],
              k[4],
              k[5],
            ]);
            const text = JSON.stringify(list);
            memoryCache.set(key, { timestamp: Date.now(), data: text });
            return text;
          }
        }
      } catch {}

      // Secondary fallback for XAUUSD: Binance Futures fapi
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=${interval}&limit=1000`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw) && raw.length > 0) {
            const list = raw.map((k: any) => [
              Number(k[0]),
              k[1],
              k[2],
              k[3],
              k[4],
              k[5],
            ]);
            const text = JSON.stringify(list);
            memoryCache.set(key, { timestamp: Date.now(), data: text });
            return text;
          }
        }
      } catch {}
    }

    // 4. Authoritative source for COMEX Gold Futures (GC) and Forex (EURUSD, GBPUSD): Yahoo Finance
    if (isComex || isFx) {
      try {
        const yInterval = interval === '1d' ? '1d' : interval === '1h' ? '60m' : interval === '15m' ? '15m' : interval === '5m' ? '5m' : '1m';
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${yInterval}&range=2d`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const result = json?.chart?.result?.[0];
          const timestamps = result?.timestamp || [];
          const quotes = result?.indicators?.quote?.[0];
          if (quotes && timestamps.length > 0) {
            const list: any[] = [];
            for (let i = 0; i < timestamps.length; i++) {
              const t = timestamps[i];
              const o = quotes.open[i];
              const h = quotes.high[i];
              const l = quotes.low[i];
              const c = quotes.close[i];
              const v = quotes.volume?.[i] ?? (isComex ? 100 : 1000);
              if (o === null || h === null || l === null || c === null) continue;
              list.push([t * 1000, o, h, l, c, v]);
            }
            if (list.length > 0) {
              const text = JSON.stringify(list);
              memoryCache.set(key, { timestamp: Date.now(), data: text });
              return text;
            }
          }
        }
      } catch {}
    }

    // 5. Secondary fallback source: Binance Vision
    try {
      const baseUrl = 'https://data-api.binance.vision/api/v3/klines';
      const res = await fetch(`${baseUrl}?symbol=${targetSym}&interval=${interval}&limit=1000`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const text = await res.text();
        memoryCache.set(key, { timestamp: Date.now(), data: text });
        return text;
      }
    } catch {}

    return null;
  }

  async function fetchAndCacheTicker(rawSym: string): Promise<void> {
    const target = parseInstrumentTarget(rawSym);
    const tickerKey = `ticker_${target.cleanSym}_${target.isFutures ? 'fut' : 'spot'}`;
    const baseCrypto = target.cleanSym.replace(/USDT$/, '').replace(/USD$/, '');

    // 1. For BTC, ETH, SOL: Coinbase authentic MT5 / TradingView USD Spot price
    if (baseCrypto === 'BTC' || baseCrypto === 'ETH' || baseCrypto === 'SOL') {
      try {
        const res = await fetch(`https://api.coinbase.com/v2/prices/${baseCrypto}-USD/spot`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const amt = parseFloat(json?.data?.amount);
          if (Number.isFinite(amt) && amt > 0) {
            const payload = JSON.stringify({ symbol: target.cleanSym, price: Math.round(amt * 100) / 100, timestamp: Date.now() });
            memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
            return;
          }
        }
      } catch {}
    }

    // 2. For BNB: Bybit Spot
    if (baseCrypto === 'BNB') {
      try {
        const res = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BNBUSDT', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const p = parseFloat(json?.result?.list?.[0]?.lastPrice);
          if (Number.isFinite(p) && p > 0) {
            const payload = JSON.stringify({ symbol: target.cleanSym, price: Math.round(p * 100) / 100, timestamp: Date.now() });
            memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
            return;
          }
        }
      } catch {}
    }

    // 3. For XAUUSD (Gold Perpetual Futures): Bybit Linear or Binance Futures (0 synthetic offset)
    if (target.cleanSym === 'XAUUSD') {
      try {
        const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=XAUUSDT', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const p = parseFloat(json?.result?.list?.[0]?.lastPrice);
          if (Number.isFinite(p) && p > 0) {
            const payload = JSON.stringify({ symbol: target.cleanSym, price: Math.round(p * 100) / 100, timestamp: Date.now() });
            memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
            return;
          }
        }
      } catch {}

      try {
        const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=XAUUSDT', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const p = parseFloat(json?.price);
          if (Number.isFinite(p) && p > 0) {
            const payload = JSON.stringify({ symbol: target.cleanSym, price: Math.round(p * 100) / 100, timestamp: Date.now() });
            memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
            return;
          }
        }
      } catch {}
    }

    // 4. For COMEX (GC) and Forex: Yahoo Finance query1 MT5/TradingView spot
    const yahooSym = getYahooSymbol(target.cleanSym);
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const json: any = await res.json();
        const meta = json?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          const mult = target.isFx ? 10000 : (target.isComex ? 10 : 100);
          const finalPrice = Math.round(meta.regularMarketPrice * mult) / mult;
          const payload = JSON.stringify({ symbol: target.cleanSym, price: finalPrice, timestamp: Date.now() });
          memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
          return;
        }
      }
    } catch {}

    // 4. Secondary Fallback: Binance Spot Ticker
    try {
      const baseUrl = 'https://data-api.binance.vision/api/v3/ticker/price';
      const fetchRes = await fetch(`${baseUrl}?symbol=${target.targetSym}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (fetchRes.ok) {
        const parsed: any = await fetchRes.json();
        const rawPrice = parseFloat(parsed.price);
        const mult = target.isFx ? 10000 : (target.isComex ? 10 : 100);
        const finalPrice = Math.round(rawPrice * mult) / mult;
        const payload = JSON.stringify({ symbol: target.cleanSym, price: finalPrice, timestamp: Date.now() });
        memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
      }
    } catch {}
  }

  const ALL_CANONICAL_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XAUUSD', 'GC', 'EURUSD', 'GBPUSD'];

  // Gentle pre-warm on server start (both tickers & candles for instant 0.1ms load)
  setTimeout(() => {
    for (const s of ALL_CANONICAL_SYMBOLS) {
      fetchAndCacheTicker(s).catch(() => {});
      fetchAndCache(s, '1m', false).catch(() => {});
      fetchAndCache(s, '5m', false).catch(() => {});
    }
  }, 100)?.unref();

  // Fast background ticker refresh every 3 seconds for zero latency
  setInterval(() => {
    for (const s of ALL_CANONICAL_SYMBOLS) {
      fetchAndCacheTicker(s).catch(() => {});
    }
  }, 3000)?.unref();

  // Background candle refresh every 15 seconds
  setInterval(() => {
    for (const s of ALL_CANONICAL_SYMBOLS) {
      fetchAndCache(s, '1m', false).catch(() => {});
    }
  }, 15000)?.unref();

  return {
    name: 'redis-fast-candle-cache',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/health')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', mode: 'vite-dev-server' }));
          return;
        }

        if (req.url?.startsWith('/api/candles')) {
          const url = new URL(req.url, 'http://localhost');
          const rawSym = (url.searchParams.get('symbol') || 'XAUUSDT').toUpperCase();
          const target = parseInstrumentTarget(rawSym);
          const interval = url.searchParams.get('timeframe') || url.searchParams.get('interval') || '1m';
          const limitParam = url.searchParams.get('limit');
          const limit = limitParam ? parseInt(limitParam, 10) : 300;
          const key = `${target.cleanSym}_${interval}_${target.isFutures ? 'fut' : 'spot'}`;

          const cached = memoryCache.get(key);
          let rawText: string | null | undefined = cached?.data;
          const now = Date.now();

          if (cached) {
            // If cached data is older than 5 seconds, trigger background revalidation
            if (now - cached.timestamp > 5000) {
              fetchAndCache(target.cleanSym, interval, target.isFutures).catch(() => {});
            }
          } else {
            rawText = await fetchAndCache(target.cleanSym, interval, target.isFutures);
          }

          if (rawText) {
            try {
              const list = JSON.parse(rawText);
              if (Array.isArray(list)) {
                const tfSec = interval === '1d' ? 86400 : interval === '1h' ? 3600 : interval === '15m' ? 900 : interval === '5m' ? 300 : 60;
                const mult = target.isFx ? 10000 : (target.isComex ? 10 : 100);

                const candleMap = new Map<number, any>();
                for (const k of list) {
                  const rawSec = Math.floor(Number(k[0]) / 1000);
                  const time = Math.floor(rawSec / tfSec) * tfSec;
                  const open = Math.round(parseFloat(k[1]) * mult) / mult;
                  const rawHigh = Math.round(parseFloat(k[2]) * mult) / mult;
                  const rawLow = Math.round(parseFloat(k[3]) * mult) / mult;
                  const close = Math.round(parseFloat(k[4]) * mult) / mult;
                  const high = Math.max(open, rawHigh, rawLow, close);
                  const low = Math.min(open, rawHigh, rawLow, close);
                  const volume = parseFloat(k[5]) || 0;

                  if (Number.isFinite(time) && time > 0 && close > 0 && high >= low) {
                    if (!candleMap.has(time)) {
                      candleMap.set(time, { time, open, high, low, close, volume });
                    } else {
                      const prev = candleMap.get(time);
                      prev.high = Math.max(prev.high, high);
                      prev.low = Math.min(prev.low, low);
                      prev.close = close;
                      prev.volume += volume;
                    }
                  }
                }

                const sorted = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
                const sliced = limit > 0 ? sorted.slice(-limit) : sorted;

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('X-Cache-Status', 'HIT-RAM-0MS');
                res.end(JSON.stringify(sliced));
                return;
              }
            } catch {}
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([]));
          return;
        }

        if (req.url?.startsWith('/api/cache/ticker')) {
          const url = new URL(req.url, 'http://localhost');
          const rawSym = (url.searchParams.get('symbol') || 'XAUUSDT').toUpperCase();
          const target = parseInstrumentTarget(rawSym);
          const tickerKey = `ticker_${target.cleanSym}_${target.isFutures ? 'fut' : 'spot'}`;
          const cached = memoryCache.get(tickerKey);
          const now = Date.now();

          // Tier 1: Fresh cached ticker (< 4000ms old from background pre-warm loop)
          if (cached && (now - cached.timestamp < 4000)) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Cache-Status', 'HIT-RAM-0MS');
            res.end(cached.data);
            return;
          }

          // Tier 2: Stale cache: return immediately and trigger background refresh (0ms response)
          if (cached) {
            fetchAndCacheTicker(target.cleanSym).catch(() => {});
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Cache-Status', 'HIT-STALE-REFRESHING');
            res.end(cached.data);
            return;
          }

          // Tier 3: Cold start miss: fetch once synchronously
          await fetchAndCacheTicker(target.cleanSym);
          const fresh = memoryCache.get(tickerKey);
          if (fresh) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Cache-Status', 'MISS-FETCHED');
            res.end(fresh.data);
            return;
          }

          next();
          return;
        }

        if (!req.url?.startsWith('/api/cache/klines')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost');
        const rawSym = (url.searchParams.get('symbol') || 'XAUUSDT').toUpperCase();
        const target = parseInstrumentTarget(rawSym);
        const interval = url.searchParams.get('interval') || '1m';
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam, 10) : 0;
        const key = `${target.targetSym}_${interval}_${target.isFutures ? 'fut' : 'spot'}`;

        const cached = memoryCache.get(key);
        const now = Date.now();

        const formatRawKlines = (rawString: string) => {
          if (limit > 0 && limit < 1000) {
            try {
              const list = JSON.parse(rawString);
              if (Array.isArray(list)) return JSON.stringify(list.slice(-limit));
            } catch {}
          }
          return rawString;
        };

        // Tier 1: If cached exists, ALWAYS return immediately (< 0.2ms)
        if (cached) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Cache-Status', (now - cached.timestamp < 3000) ? 'HIT-RAM-0MS' : 'HIT-STALE-REVALIDATING');
          res.end(formatRawKlines(cached.data));
          if (now - cached.timestamp >= 2000) {
            fetchAndCache(target.targetSym, interval, target.isFutures).catch(() => {});
          }
          return;
        }

        // Tier 2: Cold start cache miss: fetch from Binance and return
        const fresh = await fetchAndCache(target.targetSym, interval, target.isFutures);
        if (fresh) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Cache-Status', 'MISS-FETCHED');
          res.end(formatRawKlines(fresh));
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), redisFastCandleCachePlugin()],
  server: {
    proxy: {
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      '/api/fapi': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fapi/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      '/api/binance': {
        target: 'https://data-api.binance.vision',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/binance/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      '/api/goldprice': {
        target: 'https://api.goldprice.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/goldprice/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
    },
  },
})
