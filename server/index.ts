/**
 * JARVIS Trading Terminal - Cloud Backend Entrypoint
 * Fast, lightweight, free-first backend providing SQLite historical storage,
 * Redis hot caching, and production static asset serving on Render.
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { apiRouter } from './routes/api.js';
import { marketSyncService } from './services/marketSyncService.js';
import { sqliteStore } from './db/sqliteStore.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// Mount API endpoints
app.use('/api', apiRouter);

// Serve static frontend assets if dist directory exists (Render production mode)
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  console.log(`[JARVIS Backend] Serving static frontend from ${distPath}`);
  app.use(
    express.static(distPath, {
      maxAge: '1h',
      etag: true,
    })
  );

  // Client-side routing fallback: serve index.html for non-API GET routes
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
      return;
    }
    next();
  });
} else {
  console.log(`[JARVIS Backend] Running in API-only / development proxy mode (no dist/ folder found)`);
}

// Graceful shutdown handlers
const shutdown = () => {
  console.log('[JARVIS Backend] Shutting down gracefully...');
  marketSyncService.close();
  sqliteStore.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Initialize database and start listening
marketSyncService.init().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 J.A.R.V.I.S Cloud Backend is running on port ${PORT}`);
    console.log(`📊 Health Endpoint: http://localhost:${PORT}/api/health`);
    console.log(`📈 Candle Query:   http://localhost:${PORT}/api/candles?symbol=XAUUSDT&timeframe=1m`);
    console.log(`=======================================================`);
  });
}).catch((err) => {
  console.error('[JARVIS Backend] Startup initialization failed:', err);
  process.exit(1);
});
