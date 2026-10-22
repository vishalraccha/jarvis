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

  async function fetchAndCache(symbol: string, interval: string, isFutures: boolean): Promise<string | null> {
    const key = `${symbol}_${interval}`;
    const baseUrl = isFutures
      ? 'https://fapi.binance.com/fapi/v1/klines'
      : 'https://api.binance.com/api/v3/klines';
    try {
      const res = await fetch(`${baseUrl}?symbol=${symbol}&interval=${interval}&limit=1000`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const text = await res.text();
        memoryCache.set(key, { timestamp: Date.now(), data: text });
        return text;
      }
    } catch {}
    return null;
  }

  // Pre-warm benchmark gold & crypto intervals on server start, and keep fresh via background loop
  setTimeout(() => {
    const intervals = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];
    intervals.forEach((tf) => fetchAndCache('XAUUSDT', tf, true));
    fetchAndCache('BTCUSDT', '1m', true);
  }, 100)?.unref();

  setInterval(() => {
    fetchAndCache('XAUUSDT', '1m', true).catch(() => {});
    fetchAndCache('XAUUSDT', '5m', true).catch(() => {});
    fetchAndCache('BTCUSDT', '1m', true).catch(() => {});
  }, 2500)?.unref();

  return {
    name: 'redis-fast-candle-cache',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/cache/ticker')) {
          const url = new URL(req.url, 'http://localhost');
          const symbol = (url.searchParams.get('symbol') || 'XAUUSDT').toUpperCase();
          const isFutures = !url.searchParams.has('spot');
          const tickerKey = `ticker_${symbol}`;
          const cached = memoryCache.get(tickerKey);
          const now = Date.now();

          // Tier 1: Fresh cached ticker (< 1000ms old)
          if (cached && (now - cached.timestamp < 1000)) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Cache-Status', 'HIT-RAM-0MS');
            res.end(cached.data);
            return;
          }

          // Fetch fresh ticker
          const baseUrl = isFutures
            ? 'https://fapi.binance.com/fapi/v1/ticker/price'
            : 'https://api.binance.com/api/v3/ticker/price';
          try {
            const fetchRes = await fetch(`${baseUrl}?symbol=${symbol}`, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(2000),
            });
            if (fetchRes.ok) {
              const text = await fetchRes.text();
              const parsed = JSON.parse(text);
              const payload = JSON.stringify({ symbol, price: parseFloat(parsed.price), timestamp: now });
              memoryCache.set(tickerKey, { timestamp: now, data: payload });
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('X-Cache-Status', 'MISS-FETCHED');
              res.end(payload);
              return;
            }
          } catch {}

          if (cached) {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Cache-Status', 'HIT-STALE');
            res.end(cached.data);
            return;
          }

          next();
          return;
        }

        if (!req.url?.startsWith('/api/cache/klines')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost');
        const symbol = (url.searchParams.get('symbol') || 'XAUUSDT').toUpperCase();
        const interval = url.searchParams.get('interval') || '1m';
        const isFutures = !url.searchParams.has('spot');
        const limitParam = url.searchParams.get('limit');
        const limit = limitParam ? parseInt(limitParam, 10) : 0;
        const key = `${symbol}_${interval}`;

        const cached = memoryCache.get(key);
        const now = Date.now();

        // Tier 1: If cached exists, ALWAYS return immediately (< 0.2ms)
        if (cached) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Cache-Status', (now - cached.timestamp < 3000) ? 'HIT-RAM-0MS' : 'HIT-STALE-REVALIDATING');
          if (limit > 0 && limit < 1000) {
            try {
              const list = JSON.parse(cached.data);
              if (Array.isArray(list)) {
                res.end(JSON.stringify(list.slice(-limit)));
                if (now - cached.timestamp >= 2000) {
                  fetchAndCache(symbol, interval, isFutures).catch(() => {});
                }
                return;
              }
            } catch {}
          }
          res.end(cached.data);
          // Background non-blocking refresh if older than 2s
          if (now - cached.timestamp >= 2000) {
            fetchAndCache(symbol, interval, isFutures).catch(() => {});
          }
          return;
        }

        // Tier 2: Cold start cache miss: fetch from Binance and return
        const fresh = await fetchAndCache(symbol, interval, isFutures);
        if (fresh) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Cache-Status', 'MISS-FETCHED');
          if (limit > 0 && limit < 1000) {
            try {
              const list = JSON.parse(fresh);
              if (Array.isArray(list)) {
                res.end(JSON.stringify(list.slice(-limit)));
                return;
              }
            } catch {}
          }
          res.end(fresh);
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
        target: 'https://api.binance.com',
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
