/**
 * JARVIS Backend REST API Router
 * Historical queries, drop-in klines proxy, ticker, and system health status
 */

import { Router, Request, Response } from 'express';
import { marketSyncService } from '../services/marketSyncService.js';
import { hotCache } from '../cache/redisClient.js';
import { sqliteStore } from '../db/sqliteStore.js';

export const apiRouter = Router();

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
