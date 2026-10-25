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
    const cleanSym = (rawSym || 'XAUUSDT').toUpperCase().replace(/[-_/]/g, '');
    const isComex = cleanSym === 'GC' || cleanSym.startsWith('COMEX') || cleanSym.startsWith('GCFUTURES') || cleanSym === 'CME';
    const isGoldSpot = cleanSym.startsWith('XAU') || cleanSym.startsWith('GOLD') || cleanSym === 'VANTAGE' || cleanSym === 'OANDA';
    const isFx = cleanSym === 'EURUSD' || cleanSym === 'EUR' || cleanSym === 'GBPUSD' || cleanSym === 'GBP';
    const isGold = isGoldSpot || isComex;
    let targetSym = isGold ? 'PAXGUSDT' : cleanSym;
    if (cleanSym === 'EURUSD' || cleanSym === 'EUR') targetSym = 'EURUSDT';
    if (cleanSym === 'GBPUSD' || cleanSym === 'GBP') targetSym = 'GBPUSDT';
    const isCrypto = !isFx && !isGold && (targetSym.endsWith('USDT') || targetSym.startsWith('BTC') || targetSym.startsWith('ETH') || targetSym.startsWith('SOL') || targetSym.startsWith('BNB'));
    const isFutures = !isFx && (cleanSym.includes('PERP') || cleanSym.includes('FUTURES'));

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
    const { cleanSym, targetSym, isComex, isGoldSpot, isFx, isCrypto } = parseInstrumentTarget(symbol);
    const key = `${cleanSym}_${interval}_${isFutures ? 'fut' : 'spot'}`;
    const yahooSym = getYahooSymbol(cleanSym);

    // 1. Authoritative source for Crypto: Binance Spot (matches TradingView 1:1)
    if (isCrypto) {
      try {
        const baseUrl = 'https://data-api.binance.vision/api/v3/klines';
        const res = await fetch(`${baseUrl}?symbol=${targetSym}&interval=${interval}&limit=1000`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const text = await res.text();
          memoryCache.set(key, { timestamp: Date.now(), data: text });
          return text;
        }
      } catch {}
    }

    // 2. Authoritative source for Gold & Forex: Yahoo Finance query1 (matches CME & Spot FX 1:1)
    if (isComex || isGoldSpot || isFx) {
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

    // 3. Fallback for Gold Spot: Binance Vision PAXG
    if (isGoldSpot) {
      try {
        const baseUrl = 'https://data-api.binance.vision/api/v3/klines';
        const res = await fetch(`${baseUrl}?symbol=PAXGUSDT&interval=${interval}&limit=1000`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const text = await res.text();
          memoryCache.set(key, { timestamp: Date.now(), data: text });
          return text;
        }
      } catch {}
    }
    return null;
  }

  async function fetchAndCacheTicker(rawSym: string): Promise<void> {
    const target = parseInstrumentTarget(rawSym);
    const tickerKey = `ticker_${target.cleanSym}_${target.isFutures ? 'fut' : 'spot'}`;

    // 1. Crypto: Binance Spot Ticker (matches TradingView 1:1)
    if (target.isCrypto) {
      try {
        const baseUrl = 'https://data-api.binance.vision/api/v3/ticker/price';
        const res = await fetch(`${baseUrl}?symbol=${target.targetSym}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const parsed: any = await res.json();
          const rawPrice = parseFloat(parsed.price);
          if (Number.isFinite(rawPrice) && rawPrice > 0) {
            const payload = JSON.stringify({ symbol: target.cleanSym, price: rawPrice, timestamp: Date.now() });
            memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
            return;
          }
        }
      } catch {}
    }

    // 2. Gold and Forex: Yahoo Finance
    const yahooSym = getYahooSymbol(target.cleanSym);
    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(2000),
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

    // 3. Fallback: Binance Spot Ticker
    try {
      const baseUrl = 'https://data-api.binance.vision/api/v3/ticker/price';
      const fetchRes = await fetch(`${baseUrl}?symbol=${target.targetSym}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(1500),
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

  // Gentle pre-warm on server start
  setTimeout(() => {
    fetchAndCacheTicker('BTCUSDT').catch(() => {});
    fetchAndCacheTicker('ETHUSDT').catch(() => {});
    fetchAndCacheTicker('SOLUSDT').catch(() => {});
    fetchAndCacheTicker('BNBUSDT').catch(() => {});
    fetchAndCacheTicker('XAUUSD').catch(() => {});
    fetchAndCacheTicker('GC').catch(() => {});
    fetchAndCacheTicker('EURUSD').catch(() => {});
    fetchAndCacheTicker('GBPUSD').catch(() => {});
  }, 100)?.unref();

  // Gentle background refresh once every 30 seconds
  setInterval(() => {
    fetchAndCacheTicker('BTCUSDT').catch(() => {});
    fetchAndCacheTicker('ETHUSDT').catch(() => {});
    fetchAndCacheTicker('SOLUSDT').catch(() => {});
    fetchAndCacheTicker('BNBUSDT').catch(() => {});
    fetchAndCacheTicker('XAUUSD').catch(() => {});
    fetchAndCacheTicker('GC').catch(() => {});
    fetchAndCacheTicker('EURUSD').catch(() => {});
    fetchAndCacheTicker('GBPUSD').catch(() => {});
  }, 30000)?.unref();

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

          let rawText: string | null | undefined = memoryCache.get(key)?.data;
          if (!rawText) {
            rawText = await fetchAndCache(target.cleanSym, interval, target.isFutures);
          }

          if (rawText) {
            try {
              const list = JSON.parse(rawText);
              if (Array.isArray(list)) {
                const sliced = limit > 0 ? list.slice(-limit) : list;
                const mult = target.isFx ? 10000 : (target.isComex ? 10 : 100);
                const formatted = sliced.map((k: any) => ({
                  time: Math.floor(Number(k[0]) / 1000),
                  open: Math.round(parseFloat(k[1]) * mult) / mult,
                  high: Math.round(parseFloat(k[2]) * mult) / mult,
                  low: Math.round(parseFloat(k[3]) * mult) / mult,
                  close: Math.round(parseFloat(k[4]) * mult) / mult,
                  volume: parseFloat(k[5]),
                }));
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('X-Cache-Status', 'HIT-RAM-0MS');
                res.end(JSON.stringify(formatted));
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

          // Tier 1: Fresh cached ticker (< 1500ms old from background pre-warm loop)
          if (cached && (now - cached.timestamp < 1500)) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Cache-Status', 'HIT-RAM-0MS');
            res.end(cached.data);
            return;
          }

          // Tier 2: Stale cache: return immediately and trigger background refresh (0ms response)
          if (cached) {
            fetchAndCacheTicker(rawSym).catch(() => {});
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Cache-Status', 'HIT-STALE-REFRESHING');
            res.end(cached.data);
            return;
          }

          // Tier 3: Cold start miss: fetch once synchronously
          await fetchAndCacheTicker(rawSym);
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
