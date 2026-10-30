/**
 * JARVIS Positions REST API Router
 * Provides persistent server-side storage for chart positions.
 * GET /api/chart/positions?symbol=XAUUSD
 * POST /api/chart/positions
 * DELETE /api/chart/positions/:id
 */

import { Router, Request, Response } from 'express';
import { positionStorageService } from '../services/positions/PositionStorageService.js';

export const positionsRouter = Router();

// GET /api/chart/positions?symbol=...
positionsRouter.get('/', (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol as string | undefined;
    const positions = positionStorageService.getPositions(symbol);
    res.json({ status: 'ok', positions });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch positions', message: err.message });
  }
});

// POST /api/chart/positions
positionsRouter.post('/', (req: Request, res: Response) => {
  try {
    const { position, positions, symbol } = req.body;
    if (Array.isArray(positions) && symbol) {
      const saved = positionStorageService.savePositions(symbol, positions);
      res.json({ status: 'ok', positions: saved });
      return;
    }
    if (position && position.id && position.symbol) {
      const saved = positionStorageService.addOrUpdatePosition(position);
      res.json({ status: 'ok', position: saved });
      return;
    }
    res.status(400).json({ error: 'Missing position or positions array in request body' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save positions', message: err.message });
  }
});

// DELETE /api/chart/positions/:id
positionsRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const deleted = positionStorageService.deletePosition(id);
    res.json({ status: 'ok', deleted });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete position', message: err.message });
  }
});
