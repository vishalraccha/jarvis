/**
 * JARVIS Chart Position Client Service
 * Communicates with backend endpoints to persist positions on disk.
 * Never stores in browser cache or localStorage.
 */

import { ChartPosition } from '../../types/position';

export class PositionService {
  private static instance: PositionService;
  private inMemoryPositions: Map<string, ChartPosition[]> = new Map();
  private listeners: Set<(positions: ChartPosition[]) => void> = new Set();

  public static getInstance(): PositionService {
    if (!PositionService.instance) {
      PositionService.instance = new PositionService();
    }
    return PositionService.instance;
  }

  public subscribe(listener: (positions: ChartPosition[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(symbol: string) {
    const list = this.getPositionsFromMemory(symbol);
    for (const l of this.listeners) {
      try {
        l(list);
      } catch (e) {
        console.error('[PositionService] Listener error:', e);
      }
    }
  }

  public getPositionsFromMemory(symbol: string): ChartPosition[] {
    const symKey = this.canonicalSymbol(symbol);
    return this.inMemoryPositions.get(symKey) || [];
  }

  private canonicalSymbol(s: string): string {
    if (!s) return 'GLOBAL';
    const clean = s.toUpperCase().trim();
    if (clean.includes('XAU') || clean.includes('GOLD') || clean === 'GC') return 'XAUUSD';
    if (clean.includes('NAS') || clean.includes('NDX') || clean.includes('US100') || clean.includes('NQ')) return 'NAS100';
    if (clean.includes('BTC')) return 'BTCUSDT';
    if (clean.includes('ETH')) return 'ETHUSDT';
    return clean.replace(/^(BINANCE|OANDA|VANTAGE|PEPPERSTONE):/, '');
  }

  /**
   * Fetches persistent positions from the server
   */
  public async loadPositions(symbol: string): Promise<ChartPosition[]> {
    const symKey = this.canonicalSymbol(symbol);
    try {
      const res = await fetch(`/api/chart/positions?symbol=${encodeURIComponent(symKey)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: ChartPosition[] = Array.isArray(data.positions) ? data.positions : [];
      this.inMemoryPositions.set(symKey, list);
      this.notify(symbol);
      return list;
    } catch (err) {
      console.warn('[PositionService] Failed to load positions from server:', err);
      return this.inMemoryPositions.get(symKey) || [];
    }
  }

  /**
   * Saves or updates a single position to the server
   */
  public async savePosition(position: ChartPosition): Promise<ChartPosition> {
    const symKey = this.canonicalSymbol(position.symbol);
    const current = this.inMemoryPositions.get(symKey) || [];
    const idx = current.findIndex((p) => p.id === position.id);

    const updated = [...current];
    if (idx >= 0) {
      updated[idx] = position;
    } else {
      updated.push(position);
    }
    this.inMemoryPositions.set(symKey, updated);
    this.notify(position.symbol);

    try {
      const res = await fetch('/api/chart/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: { ...position, symbol: symKey } }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.position || position;
      }
    } catch (err) {
      console.error('[PositionService] Error saving position to server:', err);
    }
    return position;
  }

  /**
   * Saves all positions for a symbol to the server
   */
  public async saveAllPositions(symbol: string, positions: ChartPosition[]): Promise<ChartPosition[]> {
    const symKey = this.canonicalSymbol(symbol);
    this.inMemoryPositions.set(symKey, positions);
    this.notify(symbol);

    try {
      const res = await fetch('/api/chart/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symKey, positions }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.positions || positions;
      }
    } catch (err) {
      console.error('[PositionService] Error saving all positions:', err);
    }
    return positions;
  }

  /**
   * Deletes a position by ID from server
   */
  public async deletePosition(id: string, symbol: string): Promise<boolean> {
    const symKey = this.canonicalSymbol(symbol);
    const current = this.inMemoryPositions.get(symKey) || [];
    const filtered = current.filter((p) => p.id !== id);
    this.inMemoryPositions.set(symKey, filtered);
    this.notify(symbol);

    try {
      const res = await fetch(`/api/chart/positions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch (err) {
      console.error('[PositionService] Error deleting position:', err);
      return false;
    }
  }
}

export const positionService = PositionService.getInstance();
