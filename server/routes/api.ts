/**
 * JARVIS Backend REST API Router
 * Historical queries, drop-in klines proxy, ticker, and system health status
 */

import { Router, Request, Response } from 'express';
import { marketSyncService } from '../services/marketSyncService.js';
import { hotCache } from '../cache/redisClient.js';
import { sqliteStore } from '../db/sqliteStore.js';
import { aiRouter } from './ai.js';
import { positionsRouter } from './positions.js';
import { heatmapCacheService } from '../services/cache/HeatmapCacheService.js';

export const apiRouter = Router();

// Mount Multi-AI Subsystem Endpoints
apiRouter.use('/ai', aiRouter);

// Mount Chart Positions Persistent Storage Endpoints
apiRouter.use('/chart/positions', positionsRouter);

/**
 * Primary Historical Candles Range Query Endpoint
 * GET /api/candles?symbol=XAUUSDT&timeframe=1m&startTime=1700000000&endTime=1700003600&limit=300
 */
apiRouter.get('/candles', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSDT';
    const timeframe = (req.query.timeframe as string) || (req.query.interval as string) || '1m';
    const startTime = req.query.startTime ? parseInt(req.query.startTime as string, 10) : undefined;
    const endTime = req.query.endTime ? parseInt(req.query.endTime as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 300;
    const forceRefresh = req.query.forceRefresh === 'true';

    const candles = await marketSyncService.getCandles({
      symbol,
      timeframe,
      startTime,
      endTime,
      limit,
      forceRefresh,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=2, stale-while-revalidate=4');
    res.json(candles);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve candles', message: err.message });
  }
});

/**
 * Drop-in Compatible Proxy Endpoint for existing adapters
 * GET /api/cache/klines?symbol=XAUUSDT&interval=1m&limit=1000
 */
apiRouter.get('/cache/klines', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSDT';
    const interval = (req.query.interval as string) || '1m';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 1000;

    const rawKlines = await marketSyncService.getRawKlines(symbol, interval, limit);
    if (!rawKlines) {
      res.status(502).json({ error: 'Upstream exchange unavailable' });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Cache-Source', 'JARVIS-CLOUD-BACKEND');
    res.setHeader('Cache-Control', 'public, max-age=2');
    res.json(rawKlines);
  } catch (err: any) {
    res.status(500).json({ error: 'Kline cache fetch failed', message: err.message });
  }
});

/**
 * Drop-in Fast Ticker Endpoint
 * GET /api/cache/ticker?symbol=XAUUSDT
 */
apiRouter.get('/cache/ticker', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSDT';
    const ticker = await marketSyncService.getTickerPrice(symbol);
    if (!ticker) {
      res.status(502).json({ error: 'Ticker unavailable' });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.json(ticker);
  } catch (err: any) {
    res.status(500).json({ error: 'Ticker fetch failed', message: err.message });
  }
});

/**
 * System Health & Telemetry Endpoint
 * GET /api/health
 */
apiRouter.get('/health', (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memoryUsage: {
      rssMb: (mem.rss / (1024 * 1024)).toFixed(1),
      heapTotalMb: (mem.heapTotal / (1024 * 1024)).toFixed(1),
      heapUsedMb: (mem.heapUsed / (1024 * 1024)).toFixed(1),
    },
    hotCache: hotCache.getStats(),
    sqlite: sqliteStore.getStats(),
    timestamp: Date.now(),
  });
});

/**
 * Binance Spot & Vision Proxy for Production
 * GET /api/binance/*
 */
apiRouter.use('/binance', async (req: Request, res: Response) => {
  try {
    const targetUrl = `https://data-api.binance.vision${req.url}`;
    const upstream = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000),
    });
    const data = await upstream.text();
    res.status(upstream.status).type('application/json').send(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Upstream gateway error', message: err.message });
  }
});

/**
 * Options Chain Query Endpoint
 * GET /api/options/chain?symbol=QQQ&spot=500
 */
apiRouter.get('/options/chain', async (req: Request, res: Response) => {
  try {
    const symbol = ((req.query.symbol as string) || 'QQQ').toUpperCase();
    const spotParam = parseFloat(req.query.spot as string) || 0;

    let yahooTicker = 'QQQ';
    let optionsUnderlying = 'OPRA:QQQ';
    let provider = 'OPRA QQQ ETF Options';
    let multiplier = 100;
    let basisWarning: string | undefined;

    if (symbol === 'NAS100' || symbol === 'NASDAQ' || symbol === 'NDX') {
      yahooTicker = '^NDX';
      optionsUnderlying = 'CBOE:NDX';
      provider = 'CBOE Nasdaq-100 Index Options';
      basisWarning = 'NDX Cash Index Options reference (100x multiplier).';
    } else if (symbol === 'QQQ') {
      yahooTicker = 'QQQ';
      optionsUnderlying = 'OPRA:QQQ';
      provider = 'OPRA QQQ ETF Options';
      basisWarning = 'Invesco QQQ Trust ETF Options.';
    } else if (symbol === 'NQ' || symbol === 'MNQ') {
      yahooTicker = 'QQQ'; // Or NQ
      optionsUnderlying = symbol === 'NQ' ? 'CME:NQ_OPT' : 'CME:MNQ_OPT';
      provider = `CME ${symbol} Futures Options`;
      multiplier = symbol === 'NQ' ? 20 : 2;
      basisWarning = `${symbol} Futures Options mapped against ETF/Index options reference. Basis differential applies.`;
    } else if (symbol.startsWith('XAU') || symbol === 'GC') {
      yahooTicker = 'GLD';
      optionsUnderlying = 'COMEX:GC_OPT';
      provider = 'COMEX Gold Options';
      multiplier = 100;
      basisWarning = 'Gold options reference (100 oz contract). Spot basis differential applies.';
    } else if (symbol.startsWith('EUR')) {
      yahooTicker = 'FXE';
      optionsUnderlying = 'CME:6E_OPT';
      provider = 'CME Euro Currency Options';
      multiplier = 125000;
      basisWarning = 'Euro Currency Options reference. Spot EUR/USD basis differential applies.';
    } else if (symbol.startsWith('GBP')) {
      yahooTicker = 'FXB';
      optionsUnderlying = 'CME:6B_OPT';
      provider = 'CME British Pound Options';
      multiplier = 62500;
      basisWarning = 'British Pound Options reference. Spot GBP/USD basis differential applies.';
    }

    const yfUrl = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(yahooTicker)}`;
    const yfRes = await fetch(yfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000),
    });

    if (!yfRes.ok) {
      throw new Error(`Upstream options feed returned HTTP ${yfRes.status}`);
    }

    const json: any = await yfRes.json();
    const result = json?.optionChain?.result?.[0];
    if (!result || !result.options || result.options.length === 0) {
      throw new Error(`No options chain returned for ${yahooTicker}`);
    }

    const marketPrice = result.quote?.regularMarketPrice || spotParam || 100;
    const contracts: any[] = [];

    for (const optSet of result.options) {
      const expTimestamp = (optSet.expirationDate || 0) * 1000;
      const expDate = new Date(expTimestamp).toISOString().split('T')[0];

      for (const call of optSet.calls || []) {
        if (!call.strike || call.strike <= 0) continue;
        contracts.push({
          id: call.contractSymbol || `${symbol}-${expDate}-${call.strike}-C`,
          symbol: call.contractSymbol || `${symbol}-${expDate}-${call.strike}-C`,
          strike: call.strike,
          type: 'call',
          expiration: expDate,
          expirationTimestamp: expTimestamp,
          openInterest: call.openInterest || 0,
          volume: call.volume || 0,
          impliedVolatility: call.impliedVolatility || 0.25,
          gamma: 0,
          underlyingPrice: marketPrice,
          contractMultiplier: multiplier,
          bidPrice: call.bid,
          askPrice: call.ask,
          markPrice: call.lastPrice,
          source: provider,
        });
      }

      for (const put of optSet.puts || []) {
        if (!put.strike || put.strike <= 0) continue;
        contracts.push({
          id: put.contractSymbol || `${symbol}-${expDate}-${put.strike}-P`,
          symbol: put.contractSymbol || `${symbol}-${expDate}-${put.strike}-P`,
          strike: put.strike,
          type: 'put',
          expiration: expDate,
          expirationTimestamp: expTimestamp,
          openInterest: put.openInterest || 0,
          volume: put.volume || 0,
          impliedVolatility: put.impliedVolatility || 0.25,
          gamma: 0,
          underlyingPrice: marketPrice,
          contractMultiplier: multiplier,
          bidPrice: put.bid,
          askPrice: put.ask,
          markPrice: put.lastPrice,
          source: provider,
        });
      }
    }

    res.json({
      underlyingSymbol: symbol,
      optionsUnderlying,
      spotPrice: marketPrice,
      timestamp: Date.now(),
      openInterestDate: new Date().toISOString().split('T')[0],
      ivTimestamp: Date.now(),
      contracts,
      isStale: false,
      dataQuality: 'verified',
      basisWarning,
      provider,
    });
  } catch (err: any) {
    res.json({
      underlyingSymbol: req.query.symbol || 'UNKNOWN',
      optionsUnderlying: 'UNAVAILABLE',
      spotPrice: parseFloat(req.query.spot as string) || 0,
      timestamp: Date.now(),
      openInterestDate: new Date().toISOString().split('T')[0],
      ivTimestamp: Date.now(),
      contracts: [],
      isStale: true,
      dataQuality: 'synthetic_unavailable',
      basisWarning: 'Live options data temporarily unavailable for this asset.',
      provider: 'None',
    });
  }
});

/**
 * Online Redis Hot Cache Endpoint for Heatmap Depth Slices
 * GET /api/heatmap/slices?symbol=XAUUSD&startTime=1700000000&limit=300
 */
apiRouter.get('/heatmap/slices', async (req: Request, res: Response) => {
  try {
    const symbol = (req.query.symbol as string) || 'XAUUSD';
    const startTime = req.query.startTime ? parseInt(req.query.startTime as string, 10) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 400;

    const slices = await heatmapCacheService.getSlices(symbol, startTime, limit);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Cache-Source', 'REDIS-HOT-CACHE');
    res.json({ status: 'ok', symbol, count: slices.length, slices });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch heatmap slices', message: err.message });
  }
});

/**
 * Online Redis Hot Cache Ingest for Heatmap Depth Slices
 * POST /api/heatmap/slices
 * Body: { symbol: string, slices: ServerHeatmapRecord[] }
 */
apiRouter.post('/heatmap/slices', async (req: Request, res: Response) => {
  try {
    const { symbol, slices, slice } = req.body;
    const records = Array.isArray(slices) ? slices : slice ? [slice] : [];
    if (!symbol || records.length === 0) {
      res.status(400).json({ error: 'Missing symbol or slices array' });
      return;
    }

    const count = await heatmapCacheService.saveSlices(symbol, records);
    res.json({ status: 'ok', symbol, cachedCount: count });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save heatmap slices', message: err.message });
  }
});

/**
 * Online User Preferences Storage (Redis hot cache backed)
 * GET /api/user/preferences
 * POST /api/user/preferences
 */
apiRouter.get('/user/preferences', async (_req: Request, res: Response) => {
  try {
    const prefs = await heatmapCacheService.getPreferences();
    res.json({ status: 'ok', preferences: prefs });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load preferences', message: err.message });
  }
});

apiRouter.post('/user/preferences', async (req: Request, res: Response) => {
  try {
    const prefs = req.body?.preferences || req.body;
    if (!prefs) {
      res.status(400).json({ error: 'Missing preferences payload' });
      return;
    }
    await heatmapCacheService.savePreferences(prefs);
    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save preferences', message: err.message });
  }
});


