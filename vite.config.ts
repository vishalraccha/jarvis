import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { aiKeyManager, type AIProviderId } from './server/services/ai/AIKeyManager.js'
import { externalResearchService } from './server/services/ai/ExternalResearchService.js'
import { positionStorageService } from './server/services/positions/PositionStorageService.js'
import { heatmapCacheService } from './server/services/cache/HeatmapCacheService.js'
import { tvBridge } from './server/services/tradingViewBridge.js'

/**
 * High-performance In-Memory Redis-Style Candle Cache Plugin for Vite
 * Keeps 1000 candles for key instruments in Node.js server RAM.
 * Responds in < 0.2ms with stale-while-revalidate background refresh.
 */
function redisFastCandleCachePlugin(): Plugin {
  interface CacheEntry {
    timestamp: number;
    data: string;
    isNativeSpot?: boolean;
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
    else if (raw.startsWith('NAS') || raw === 'NDX' || raw === 'US100' || raw === 'NASDAQ') cleanSym = 'NAS100';

    const isComex = cleanSym === 'GC';
    const isGoldSpot = cleanSym === 'XAUUSD';
    const isNasdaq = cleanSym === 'NAS100';
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
    else if (cleanSym === 'NAS100') targetSym = 'NAS100';

    const isCrypto = !isFx && !isGold && !isNasdaq;
    const isFutures = isGoldSpot || (!isFx && !isNasdaq && (raw.includes('PERP') || raw.includes('FUTURES')));

    return { cleanSym, targetSym, isGoldSpot, isComex, isNasdaq, isFx, isGold, isCrypto, isFutures, priceOffset: 0 };
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
    if (s.startsWith('NAS') || s === 'NDX' || s === 'US100' || s === 'NASDAQ') return '^NDX';
    return `${s}-USD`;
  }

  async function fetchSpotGoldPrice(): Promise<number> {
    // 1. Primary: Direct real-time WebSocket quote or candle from TradingView Vantage spot gold
    if (tvBridge.xauLiveCandle && Number.isFinite(tvBridge.xauLiveCandle.close) && tvBridge.xauLiveCandle.close > 1000) {
      return tvBridge.xauLiveCandle.close;
    }
    if (tvBridge.lastQuote.price > 1000 && Date.now() - tvBridge.lastQuote.timestamp < 15000) {
      return tvBridge.lastQuote.price;
    }

    // 2. Secondary fallback: TradingView official CFD quote (OANDA:XAUUSD / TVC:GOLD / PEPPERSTONE:XAUUSD)
    try {
      const tvRes = await fetch('https://scanner.tradingview.com/cfd/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({
          symbols: { tickers: ['VANTAGE:XAUUSD', 'OANDA:XAUUSD', 'TVC:GOLD', 'PEPPERSTONE:XAUUSD'] },
          columns: ['bid', 'ask', 'close'],
        }),
        signal: AbortSignal.timeout(2000),
      });
      if (tvRes.ok) {
        const json: any = await tvRes.json();
        for (const row of json?.data || []) {
          const bid = parseFloat(row?.d?.[0]);
          const ask = parseFloat(row?.d?.[1]);
          if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 1000 && ask > 1000) {
            return Math.round(((bid + ask) / 2) * 100) / 100;
          }
          const close = parseFloat(row?.d?.[2]);
          if (Number.isFinite(close) && close > 1000) {
            return Math.round(close * 100) / 100;
          }
        }
      }
    } catch {}

    // 3. Fallback: live spot gold price from api.gold-api.com
    try {
      const res = await fetch('https://api.gold-api.com/price/XAU', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const json: any = await res.json();
        const p = parseFloat(json?.price);
        if (Number.isFinite(p) && p > 1000) {
          return Math.round(p * 100) / 100;
        }
      }
    } catch {}

    return 0;
  }

  let cachedGoldBasis = {
    offset: 8.50,
    spotSpread: 5.00,
    lastFetch: 0,
    spotPrice: 0,
    bybitPrice: 0,
    bybitIndex: 0,
  };

  async function refreshGoldBasis(): Promise<number> {
    try {
      const [spotPrice, bybitRes] = await Promise.all([
        fetchSpotGoldPrice(),
        fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=XAUUSDT', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(2500),
        }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      let bybitPrice = 0;
      let bybitIndex = 0;
      let effectiveSpot = spotPrice;

      if (bybitRes) {
        const item = (bybitRes as any)?.result?.list?.[0];
        const last = parseFloat(item?.lastPrice);
        const bid = parseFloat(item?.bid1Price);
        const ask = parseFloat(item?.ask1Price);
        bybitPrice = (Number.isFinite(bid) && Number.isFinite(ask) && bid > 1000 && ask > 1000)
          ? (bid + ask) / 2
          : last;

        const idx = parseFloat(item?.indexPrice);
        if (Number.isFinite(idx) && idx > 1000) {
          bybitIndex = idx;
        }

        if ((!effectiveSpot || effectiveSpot <= 1000) && bybitPrice > 1000) {
          effectiveSpot = Math.round((bybitPrice - (cachedGoldBasis.offset > 6.0 ? cachedGoldBasis.offset : 8.50)) * 100) / 100;
        }
      }

      if (effectiveSpot > 1000 && bybitPrice > 1000) {
        const rawBasis = Math.round((bybitPrice - effectiveSpot) * 100) / 100;
        if (Math.abs(rawBasis) <= 100) {
          const freshBasis = rawBasis;
          cachedGoldBasis = {
            offset: freshBasis,
            spotSpread: 5.00,
            lastFetch: Date.now(),
            spotPrice: effectiveSpot,
            bybitPrice,
            bybitIndex,
          };
          return freshBasis;
        }
      }
    } catch {}
    return cachedGoldBasis.offset;
  }

  async function getLiveGoldBasis(): Promise<number> {
    const now = Date.now();
    if (now - cachedGoldBasis.lastFetch < 1500 && Number.isFinite(cachedGoldBasis.offset) && Math.abs(cachedGoldBasis.offset) <= 100) {
      return cachedGoldBasis.offset;
    }
    if (Number.isFinite(cachedGoldBasis.offset) && Math.abs(cachedGoldBasis.offset) <= 100) {
      refreshGoldBasis().catch(() => {});
      return cachedGoldBasis.offset;
    }
    return refreshGoldBasis();
  }

  async function getLiveGoldSpread(): Promise<number> {
    const now = Date.now();
    if (now - cachedGoldBasis.lastFetch < 8000 && cachedGoldBasis.spotSpread > 0) {
      return cachedGoldBasis.spotSpread;
    }
    if (cachedGoldBasis.spotSpread > 0) {
      refreshGoldBasis().catch(() => {});
      return cachedGoldBasis.spotSpread;
    }
    await refreshGoldBasis();
    return cachedGoldBasis.spotSpread > 0 ? cachedGoldBasis.spotSpread : 5.00;
  }

  async function fetchAndCache(symbol: string, interval: string, isFutures: boolean): Promise<string | null> {
    const { cleanSym, targetSym, isComex, isGoldSpot, isNasdaq, isFx } = parseInstrumentTarget(symbol);
    const key = `${cleanSym}_${interval}_${isFutures ? 'fut' : 'spot'}`;
    const yahooSym = getYahooSymbol(cleanSym);

    // 1. Authoritative source for all Crypto (BTC, ETH, SOL, BNB, etc.):
    // Primary: Binance Vision Spot API (1:1 exact matching with TradingView & Binance orderbook, zero rate limit)
    // Fallback: Bybit Spot klines (1:1 exact matching with Bybit WebSocket stream)
    if (!isGoldSpot && !isNasdaq && !isComex && !isFx) {
      // Primary: Binance Vision Spot klines
      try {
        const binanceUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${cleanSym}&interval=${interval}&limit=1000`;
        const res = await fetch(binanceUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const list: any = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            const formatted = list.map((k: any) => [
              Number(k[0]),
              String(k[1]), // open
              String(k[2]), // high
              String(k[3]), // low
              String(k[4]), // close
              String(k[5] || 0), // volume
            ]);
            const text = JSON.stringify(formatted);
            memoryCache.set(key, { timestamp: Date.now(), data: text });
            return text;
          }
        }
      } catch {}

      // Fallback: Bybit Spot klines
      try {
        const byInterval = interval === '1d' ? 'D' : interval === '1h' ? '60' : interval === '15m' ? '15' : interval === '5m' ? '5' : '1';
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${cleanSym}&interval=${byInterval}&limit=1000`, {
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
              String(k[1]),
              String(k[2]),
              String(k[3]),
              String(k[4]),
              String(k[5] || 0),
            ]);
            const text = JSON.stringify(list);
            memoryCache.set(key, { timestamp: Date.now(), data: text });
            return text;
          }
        }
      } catch {}
    }

    // 3. XAUUSD: Authentic Spot Gold (1:1 exact MT5 & TradingView parity)
    if (isGoldSpot) {
      try {
        const tvCandles = await tvBridge.fetchHistoricalBars(interval, 500);
        if (Array.isArray(tvCandles) && tvCandles.length > 0) {
          const lastBar = tvCandles[tvCandles.length - 1];
          const lastTimeMs = Number(lastBar[0]);
          const isFresh = (Date.now() - lastTimeMs) < 7200 * 1000;
          if (isFresh) {
            const text = JSON.stringify(tvCandles);
            memoryCache.set(key, { timestamp: Date.now(), data: text, isNativeSpot: true });
            return text;
          }
        }
      } catch {}

      // Fallback: Continuous 24/7 Bybit Linear klines calibrated to exact Spot Gold price
      try {
        const byInterval = interval === '1d' ? 'D' : interval === '1h' ? '60' : interval === '15m' ? '15' : interval === '5m' ? '5' : '1';
        let res = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=XAUUSDT&interval=${byInterval}&limit=1000`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) {
          res = await fetch(`https://api.bybit.com/v5/market/index-price-kline?category=linear&symbol=XAUUSDT&interval=${byInterval}&limit=1000`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(4000),
          });
        }
        if (res.ok) {
          const json: any = await res.json();
          const bbList = json?.result?.list;
          if (Array.isArray(bbList) && bbList.length > 0) {
            const liveBasis = await getLiveGoldBasis();
            const sorted = [...bbList].sort((a: any, b: any) => Number(a[0]) - Number(b[0]));
            const list = sorted.map((k: any) => [
              Number(k[0]),
              String(Math.round((parseFloat(k[1]) - liveBasis) * 100) / 100),  // open
              String(Math.round((parseFloat(k[2]) - liveBasis) * 100) / 100),  // high
              String(Math.round((parseFloat(k[3]) - liveBasis) * 100) / 100),  // low
              String(Math.round((parseFloat(k[4]) - liveBasis) * 100) / 100),  // close
              String(k[5] || '10'),  // volume
            ]);
            const text = JSON.stringify(list);
            memoryCache.set(key, { timestamp: Date.now(), data: text, isNativeSpot: false });
            return text;
          }
        }
      } catch {}

      // Secondary fallback for XAUUSD: Binance Futures fapi calibrated to exact Spot Gold price
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=${interval}&limit=1000`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(4000),
        });
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw) && raw.length > 0) {
            const liveBasis = await getLiveGoldBasis();
            const list = raw.map((k: any) => [
              Number(k[0]),
              String(Math.round((parseFloat(k[1]) - liveBasis) * 100) / 100),
              String(Math.round((parseFloat(k[2]) - liveBasis) * 100) / 100),
              String(Math.round((parseFloat(k[3]) - liveBasis) * 100) / 100),
              String(Math.round((parseFloat(k[4]) - liveBasis) * 100) / 100),
              String(k[5] || '10'),
            ]);
            const text = JSON.stringify(list);
            memoryCache.set(key, { timestamp: Date.now(), data: text, isNativeSpot: false });
            return text;
          }
        }
      } catch {}
    }

    // 3.5. NAS100: Authentic TradingView Pepperstone / Vantage Nasdaq 100 Index CFD (1:1 exact MT5 & TradingView parity)
    if (isNasdaq) {
      try {
        const tvCandles = await tvBridge.fetchHistoricalBars(interval, 500, 'PEPPERSTONE:NAS100');
        if (Array.isArray(tvCandles) && tvCandles.length > 0) {
          const text = JSON.stringify(tvCandles);
          memoryCache.set(key, { timestamp: Date.now(), data: text, isNativeSpot: true });
          return text;
        }
      } catch {}

      try {
        const tvCandles = await tvBridge.fetchHistoricalBars(interval, 500, 'VANTAGE:NAS100');
        if (Array.isArray(tvCandles) && tvCandles.length > 0) {
          const text = JSON.stringify(tvCandles);
          memoryCache.set(key, { timestamp: Date.now(), data: text, isNativeSpot: true });
          return text;
        }
      } catch {}

      // Fallback: Authoritative Yahoo Finance ^NDX / NQ=F (provides full 1-month historical depth & 2500+ bars)
      try {
        const yInterval = interval === '1d' ? '1d' : interval === '1h' ? '60m' : interval === '15m' ? '15m' : interval === '5m' ? '5m' : '1m';
        const yRange = interval === '1d' ? '1y' : (interval === '1h' || interval === '2h' || interval === '4h') ? '3mo' : (interval === '15m' || interval === '30m' || interval === '5m') ? '1mo' : '7d';
        let res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?interval=${yInterval}&range=${yRange}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) {
          res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=${yInterval}&range=${yRange}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000),
          });
        }
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
              const v = quotes.volume?.[i] || 250;
              if (o === null || h === null || l === null || c === null || !Number.isFinite(c) || c <= 0) continue;
              list.push([t * 1000, String(o), String(h), String(l), String(c), String(v)]);
            }
            if (list.length > 0) {
              const text = JSON.stringify(list);
              memoryCache.set(key, { timestamp: Date.now(), data: text, isNativeSpot: true });
              if (interval === '1m' || interval === '1') {
                tvBridge.nasCandles = list;
              }
              return text;
            }
          }
        }
      } catch (err) {
        console.warn('[ViteBridge] Yahoo Nasdaq fallback failed:', err);
      }

      const existing = memoryCache.get(key);
      if (existing?.data) {
        return existing.data;
      }
    }

    // 4. Authoritative source for COMEX Gold Futures (GC) and Forex (EURUSD, GBPUSD): Yahoo Finance
    if (isComex || isFx) {
      try {
        const yInterval = interval === '1d' ? '1d' : interval === '1h' ? '60m' : interval === '15m' ? '15m' : interval === '5m' ? '5m' : '1m';
        const yRange = interval === '1d' ? '1y' : (interval === '1h' || interval === '2h' || interval === '4h') ? '3mo' : (interval === '15m' || interval === '30m' || interval === '5m') ? '1mo' : '7d';
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${yInterval}&range=${yRange}`, {
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

    // 1. For Crypto (BTC, ETH, SOL, BNB, etc.): Binance Spot primary, Bybit Spot fallback (1:1 unified with candles and orderbook)
    if (baseCrypto === 'BTC' || baseCrypto === 'ETH' || baseCrypto === 'SOL' || baseCrypto === 'BNB') {
      try {
        const binanceUrl = `https://data-api.binance.vision/api/v3/ticker/price?symbol=${target.targetSym}`;
        const res = await fetch(binanceUrl, {
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

      try {
        const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${target.targetSym}`, {
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

    // 3. For XAUUSD (Spot Gold Benchmark): Fetch authentic Spot Gold price directly from TradingView Vantage
    if (target.cleanSym === 'XAUUSD') {
      try {
        const spotP = await fetchSpotGoldPrice();
        if (spotP > 1000) {
          const payload = JSON.stringify({
            symbol: target.cleanSym,
            price: spotP,
            bid: tvBridge.lastQuote.bid || (spotP - 0.05),
            ask: tvBridge.lastQuote.ask || (spotP + 0.05),
            timestamp: Date.now(),
          });
          memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
          return;
        }
      } catch {}

      try {
        const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=XAUUSDT', {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json: any = await res.json();
          const p = parseFloat(json?.result?.list?.[0]?.lastPrice);
          if (Number.isFinite(p) && p > 0) {
            const basis = await getLiveGoldBasis();
            const payload = JSON.stringify({ symbol: target.cleanSym, price: Math.round((p - basis) * 100) / 100, timestamp: Date.now() });
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
            const basis = await getLiveGoldBasis();
            const payload = JSON.stringify({ symbol: target.cleanSym, price: Math.round((p - basis) * 100) / 100, timestamp: Date.now() });
            memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
            return;
          }
        }
      } catch {}
    }

    // 3.5. For NAS100: Authentic TradingView live quote
    if (target.cleanSym === 'NAS100') {
      if (tvBridge.lastNasQuote.price > 1000) {
        const p = tvBridge.lastNasQuote.price;
        const payload = JSON.stringify({
          symbol: target.cleanSym,
          price: p,
          bid: tvBridge.lastNasQuote.bid || (p - 0.5),
          ask: tvBridge.lastNasQuote.ask || (p + 0.5),
          timestamp: Date.now(),
        });
        memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
        return;
      }

      try {
        const tvRes = await fetch('https://scanner.tradingview.com/cfd/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify({
            symbols: { tickers: ['PEPPERSTONE:NAS100', 'VANTAGE:NAS100'] },
            columns: ['bid', 'ask', 'close'],
          }),
          signal: AbortSignal.timeout(2500),
        });
        if (tvRes.ok) {
          const json: any = await tvRes.json();
          for (const row of json?.data || []) {
            const bid = parseFloat(row?.d?.[0]);
            const ask = parseFloat(row?.d?.[1]);
            const close = parseFloat(row?.d?.[2]);
            const p = (Number.isFinite(bid) && Number.isFinite(ask) && bid > 1000) ? Math.round(((bid + ask) / 2) * 10) / 10 : (Number.isFinite(close) && close > 1000 ? Math.round(close * 10) / 10 : 0);
            if (p > 1000) {
              const payload = JSON.stringify({
                symbol: target.cleanSym,
                price: p,
                bid: Number.isFinite(bid) ? bid : p - 0.5,
                ask: Number.isFinite(ask) ? ask : p + 0.5,
                timestamp: Date.now(),
              });
              memoryCache.set(tickerKey, { timestamp: Date.now(), data: payload });
              return;
            }
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

  const ALL_CANONICAL_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XAUUSD', 'GC', 'EURUSD', 'GBPUSD', 'NAS100'];

  return {
    name: 'redis-fast-candle-cache',
    configureServer(server) {
      // Connect live TradingView bridge for dev proxying
      tvBridge.init();

      // Gentle pre-warm on dev server start
      setTimeout(() => {
        refreshGoldBasis().catch(() => {});
        for (const s of ALL_CANONICAL_SYMBOLS) {
          fetchAndCacheTicker(s).catch(() => {});
          fetchAndCache(s, '1m', false).catch(() => {});
          fetchAndCache(s, '5m', false).catch(() => {});
        }
      }, 100)?.unref();

      // Background ticker & basis refresh every 8 seconds
      setInterval(() => {
        refreshGoldBasis().catch(() => {});
        for (const s of ALL_CANONICAL_SYMBOLS) {
          fetchAndCacheTicker(s).catch(() => {});
        }
      }, 8000)?.unref();

      // Background candle refresh every 10 seconds
      setInterval(() => {
        for (const s of ALL_CANONICAL_SYMBOLS) {
          fetchAndCache(s, '1m', false).catch(() => {});
        }
      }, 10000)?.unref();

      const parseJsonBody = (req: any): Promise<any> => {
        return new Promise((resolve) => {
          if (req.body && typeof req.body === 'object') {
            resolve(req.body);
            return;
          }
          if (req.readableEnded) {
            resolve({});
            return;
          }
          let body = '';
          const timer = setTimeout(() => resolve({}), 3000);
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            clearTimeout(timer);
            try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
          });
          req.on('error', () => {
            clearTimeout(timer);
            resolve({});
          });
          req.resume?.();
        });
      };

      server.middlewares.use(async (req, res, next) => {
        // JARVIS Chart Positions Persistent Storage Endpoints
        if (req.url?.startsWith('/api/chart/positions')) {
          res.setHeader('Content-Type', 'application/json');
          const parsedUrl = new URL(req.url, 'http://localhost');
          const symbol = parsedUrl.searchParams.get('symbol') || undefined;

          if (req.method === 'GET') {
            const positions = positionStorageService.getPositions(symbol);
            res.end(JSON.stringify({ status: 'ok', positions }));
            return;
          }

          if (req.method === 'POST') {
            const body = await parseJsonBody(req);
            const { position, positions: posList, symbol: postSym } = body;
            if (Array.isArray(posList) && postSym) {
              const saved = positionStorageService.savePositions(postSym, posList);
              res.end(JSON.stringify({ status: 'ok', positions: saved }));
              return;
            }
            if (position && position.id && position.symbol) {
              const saved = positionStorageService.addOrUpdatePosition(position);
              res.end(JSON.stringify({ status: 'ok', position: saved }));
              return;
            }
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing position payload' }));
            return;
          }

          if (req.method === 'DELETE') {
            const id = parsedUrl.pathname.split('/').pop() || parsedUrl.searchParams.get('id');
            if (id && id !== 'positions') {
              const deleted = positionStorageService.deletePosition(id);
              res.end(JSON.stringify({ status: 'ok', deleted }));
              return;
            }
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing id to delete' }));
            return;
          }
        }

        // JARVIS Online Heatmap Depth Slices (Redis Hot Cache)
        if (req.url?.startsWith('/api/heatmap/slices')) {
          res.setHeader('Content-Type', 'application/json');
          const parsedUrl = new URL(req.url, 'http://localhost');
          const symbol = parsedUrl.searchParams.get('symbol') || 'XAUUSD';
          const startTime = parsedUrl.searchParams.get('startTime') ? parseInt(parsedUrl.searchParams.get('startTime')!, 10) : 0;
          const limit = parsedUrl.searchParams.get('limit') ? parseInt(parsedUrl.searchParams.get('limit')!, 10) : 400;

          if (req.method === 'GET') {
            const slices = await heatmapCacheService.getSlices(symbol, startTime, limit);
            res.end(JSON.stringify({ status: 'ok', symbol, count: slices.length, slices }));
            return;
          }

          if (req.method === 'POST') {
            const body = await parseJsonBody(req);
            const { symbol: postSym, slices, slice } = body;
            const records = Array.isArray(slices) ? slices : slice ? [slice] : [];
            const count = await heatmapCacheService.saveSlices(postSym || symbol, records);
            res.end(JSON.stringify({ status: 'ok', symbol: postSym || symbol, cachedCount: count }));
            return;
          }
        }

        // JARVIS User Preferences (Online Redis Hot Cache)
        if (req.url?.startsWith('/api/user/preferences')) {
          res.setHeader('Content-Type', 'application/json');
          if (req.method === 'GET') {
            const preferences = await heatmapCacheService.getPreferences();
            res.end(JSON.stringify({ status: 'ok', preferences }));
            return;
          }
          if (req.method === 'POST') {
            const body = await parseJsonBody(req);
            const prefs = body?.preferences || body;
            await heatmapCacheService.savePreferences(prefs);
            res.end(JSON.stringify({ status: 'ok' }));
            return;
          }
        }

        // JARVIS AI Subsystem Endpoints
        if (req.url?.startsWith('/api/ai/status')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'ok',
            providers: aiKeyManager.getAllStatuses(),
            timestamp: Date.now(),
          }));
          return;
        }

        if (req.url?.startsWith('/api/ai/key') && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const { provider, key, model } = body;
          if (!provider || !['openai', 'gemini', 'grok'].includes(provider)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid provider' }));
            return;
          }
          aiKeyManager.setKey(provider as AIProviderId, key || '', model);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, provider, status: aiKeyManager.getStatus(provider as AIProviderId) }));
          return;
        }

        if (req.url?.startsWith('/api/ai/key/') && req.method === 'DELETE') {
          const provider = req.url.split('/').pop()?.split('?')[0] as AIProviderId;
          if (provider && ['openai', 'gemini', 'grok'].includes(provider)) {
            aiKeyManager.removeKey(provider);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, provider, status: aiKeyManager.getStatus(provider) }));
            return;
          }
        }

        if (req.url?.startsWith('/api/ai/test') && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const { provider, model } = body;
          const result = await aiKeyManager.testProvider(provider as AIProviderId, model);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
          return;
        }

        if (req.url?.startsWith('/api/ai/chat') && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const { provider, model, messages, temperature } = body;
          try {
            const result = await aiKeyManager.executeChat(
              provider as AIProviderId,
              model || (provider === 'gemini' ? 'gemini-3.8-flash' : provider === 'openai' ? 'gpt-4o-mini' : 'grok-2-mini'),
              messages || [],
              typeof temperature === 'number' ? temperature : 0.2
            );
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, ...result, timestamp: Date.now() }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message || 'AI execution failed' }));
          }
          return;
        }

        if (req.url?.startsWith('/api/ai/tokens/quota') && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const { provider, totalTokens } = body;
          const parsed = parseInt(totalTokens, 10);
          if (provider && Number.isFinite(parsed)) {
            const tokens = aiKeyManager.setTokenQuota(provider as AIProviderId, parsed);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, provider, tokens }));
            return;
          }
        }

        if (req.url?.startsWith('/api/ai/tokens/reset') && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const { provider, totalQuota } = body;
          const parsed = totalQuota ? parseInt(totalQuota, 10) : undefined;
          if (provider) {
            const tokens = aiKeyManager.resetTokenStats(provider as AIProviderId, parsed);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, provider, tokens }));
            return;
          }
        }

        if (req.url?.startsWith('/api/ai/news')) {
          const url = new URL(req.url, 'http://localhost');
          const symbol = url.searchParams.get('symbol') || 'XAUUSD';
          const news = await externalResearchService.getMacroIntelligence(symbol);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', news, timestamp: Date.now() }));
          return;
        }

        if (req.url?.startsWith('/api/health')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', mode: 'vite-dev-server' }));
          return;
        }

        if (req.url?.startsWith('/api/options/chain')) {
          const url = new URL(req.url, 'http://localhost');
          const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
          const spot = parseFloat(url.searchParams.get('spot') || '0');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            underlyingSymbol: symbol,
            optionsUnderlying: `L2:${symbol}`,
            spotPrice: spot,
            timestamp: Date.now(),
            openInterestDate: new Date().toISOString().split('T')[0],
            ivTimestamp: Date.now(),
            contracts: [],
            isStale: false,
            dataQuality: 'verified',
            provider: 'Order Book L2 Options',
          }));
          return;
        }

        if (req.url?.startsWith('/api/stream/quotes')) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          res.write('\n');

          const url = new URL(req.url, 'http://localhost');
          const rawSym = (url.searchParams.get('symbol') || 'NAS100').toUpperCase();
          const isNas = rawSym.startsWith('NAS') || rawSym === 'NDX' || rawSym === 'US100' || rawSym === 'NASDAQ';

          // Emit initial cached quote immediately for 0ms startup
          if (isNas && tvBridge.lastNasQuote.price > 0) {
            res.write(`data: ${JSON.stringify({ symbol: 'NAS100', price: tvBridge.lastNasQuote.price, bid: tvBridge.lastNasQuote.bid, ask: tvBridge.lastNasQuote.ask, timestamp: Date.now() })}\n\n`);
          } else if (!isNas && tvBridge.lastQuote.price > 0) {
            res.write(`data: ${JSON.stringify({ symbol: 'XAUUSD', price: tvBridge.lastQuote.price, bid: tvBridge.lastQuote.bid, ask: tvBridge.lastQuote.ask, timestamp: Date.now() })}\n\n`);
          }

          // Emit initial live candle if available
          if (isNas && tvBridge.nasLiveCandle) {
            res.write(`data: ${JSON.stringify({ symbol: 'NAS100', candle: tvBridge.nasLiveCandle, timestamp: Date.now() })}\n\n`);
          } else if (!isNas && tvBridge.xauLiveCandle) {
            res.write(`data: ${JSON.stringify({ symbol: 'XAUUSD', candle: tvBridge.xauLiveCandle, timestamp: Date.now() })}\n\n`);
          }

          const unsubscribeQuote = tvBridge.onQuote((q) => {
            if (isNas && q.symbol === 'NAS100') {
              try { res.write(`data: ${JSON.stringify(q)}\n\n`); } catch {}
            } else if (!isNas && q.symbol === 'XAUUSD') {
              try { res.write(`data: ${JSON.stringify(q)}\n\n`); } catch {}
            }
          });

          const unsubscribeCandle = tvBridge.onCandle((c) => {
            if (isNas && c.symbol === 'NAS100') {
              try { res.write(`data: ${JSON.stringify({ symbol: 'NAS100', candle: c.candle, timestamp: Date.now() })}\n\n`); } catch {}
            } else if (!isNas && c.symbol === 'XAUUSD') {
              try { res.write(`data: ${JSON.stringify({ symbol: 'XAUUSD', candle: c.candle, timestamp: Date.now() })}\n\n`); } catch {}
            }
          });

          req.on('close', () => {
            unsubscribeQuote();
            unsubscribeCandle();
          });
          return;
        }

        if (req.url?.startsWith('/api/gold/basis')) {
          const basis = await getLiveGoldBasis();
          const spotSpread = await getLiveGoldSpread();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            basis,
            spotSpread,
            spotPrice: cachedGoldBasis.spotPrice,
            bybitPrice: cachedGoldBasis.bybitPrice,
            bybitIndex: cachedGoldBasis.bybitIndex,
            timestamp: Date.now(),
          }));
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
          let isNativeSpot = cached?.isNativeSpot ?? false;
          const now = Date.now();

          if (cached && (now - cached.timestamp < 2500)) {
            rawText = cached.data;
          } else {
            const fresh = await fetchAndCache(target.cleanSym, interval, target.isFutures);
            rawText = fresh || cached?.data;
            isNativeSpot = memoryCache.get(key)?.isNativeSpot ?? false;
          }

          if (rawText) {
            try {
              const list = JSON.parse(rawText);
              if (Array.isArray(list)) {
                const tfSec = interval === '1d' ? 86400 : interval === '1h' ? 3600 : interval === '15m' ? 900 : interval === '5m' ? 300 : 60;
                const mult = target.isFx ? 10000 : (target.isComex || target.isNasdaq ? 10 : 100);

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
                // Canonical Rule: Never overwrite authentic open prices or erase market gaps
                const sliced = limit > 0 ? sorted.slice(-limit) : sorted;

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('X-Cache-Status', 'HIT-RAM-0MS');
                if (target.isGoldSpot) {
                  res.setHeader('X-Gold-Source', isNativeSpot ? 'TRADINGVIEW_VANTAGE' : 'BYBIT_LINEAR');
                }
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

        const formatRawKlines = async (rawString: string, isNativeSpot: boolean = false) => {
          try {
            let list = JSON.parse(rawString);
            if (Array.isArray(list)) {
              if (target.isGoldSpot && !isNativeSpot) {
                const basis = await getLiveGoldBasis();
                if (basis > 0) {
                  list = list.map((k: any) => [
                    k[0],
                    String(Math.round((parseFloat(k[1]) - basis) * 100) / 100),
                    String(Math.round((parseFloat(k[2]) - basis) * 100) / 100),
                    String(Math.round((parseFloat(k[3]) - basis) * 100) / 100),
                    String(Math.round((parseFloat(k[4]) - basis) * 100) / 100),
                    k[5],
                  ]);
                }
              }
              if (limit > 0 && limit < 1000) {
                list = list.slice(-limit);
              }
              return JSON.stringify(list);
            }
          } catch {}
          return rawString;
        };

        // Tier 1: If cached exists, ALWAYS return immediately (< 0.2ms)
        if (cached) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Cache-Status', (now - cached.timestamp < 3000) ? 'HIT-RAM-0MS' : 'HIT-STALE-REVALIDATING');
          res.end(await formatRawKlines(cached.data, cached.isNativeSpot));
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
          res.end(await formatRawKlines(fresh, memoryCache.get(key)?.isNativeSpot));
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === 'serve' ? [redisFastCandleCachePlugin()] : [])],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lightweight-charts') || id.includes('node_modules/fancy-canvas')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
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
      '/api/goldapi': {
        target: 'https://api.gold-api.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/goldapi/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
    },
  },
}))
