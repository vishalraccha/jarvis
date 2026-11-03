/**
 * JARVIS Chart Position Storage Service
 * Server-side persistent storage for Long and Short trade positions.
 * Saves positions directly to disk in data/chart_positions.json (never in browser cache).
 */

import fs from 'node:fs';
import path from 'node:path';

export type PositionType = 'LONG' | 'SHORT';

export interface ChartPosition {
  id: string;
  symbol: string;
  type: PositionType;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  startTime: number; // Unix timestamp in seconds
  endTime: number;   // Unix timestamp in seconds
  widthPx?: number;
  accountSize?: number;
  riskAmount?: number;
  closed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export class PositionStorageService {
  private filePath: string;
  private cache: Record<string, ChartPosition[]> = {};
  private isLoaded = false;

  constructor() {
    this.filePath = path.join(process.cwd(), 'data', 'chart_positions.json');
    this.ensureStorage();
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

  private ensureStorage() {
    try {
      const dataDir = path.dirname(this.filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.cache = JSON.parse(raw);
        this.isLoaded = true;
      } else {
        this.cache = {};
        this.flush();
        this.isLoaded = true;
      }
    } catch (err) {
      console.error('[PositionStorageService] Storage initialization warning:', err);
      this.cache = {};
    }
  }

  private flush() {
    try {
      const dataDir = path.dirname(this.filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PositionStorageService] Failed to write positions to disk:', err);
    }
  }

  public getPositions(symbol?: string): ChartPosition[] {
    if (!this.isLoaded) this.ensureStorage();
    if (!symbol) {
      const all: ChartPosition[] = [];
      for (const list of Object.values(this.cache)) {
        all.push(...list);
      }
      return all;
    }
    const symKey = this.canonicalSymbol(symbol);
    return this.cache[symKey] || [];
  }

  public savePositions(symbol: string, positions: ChartPosition[]): ChartPosition[] {
    if (!this.isLoaded) this.ensureStorage();
    const symKey = this.canonicalSymbol(symbol);
    const now = Date.now();
    const updated = positions.map((p) => ({
      ...p,
      symbol: symKey,
      updatedAt: now,
      createdAt: p.createdAt || now,
    }));
    this.cache[symKey] = updated;
    this.flush();
    return updated;
  }

  public addOrUpdatePosition(position: ChartPosition): ChartPosition {
    if (!this.isLoaded) this.ensureStorage();
    const symKey = this.canonicalSymbol(position.symbol);
    const now = Date.now();
    const list = this.cache[symKey] ? [...this.cache[symKey]] : [];
    const idx = list.findIndex((p) => p.id === position.id);

    const updatedPos: ChartPosition = {
      ...position,
      symbol: symKey,
      updatedAt: now,
      createdAt: position.createdAt || now,
    };

    if (idx >= 0) {
      list[idx] = updatedPos;
    } else {
      list.push(updatedPos);
    }

    this.cache[symKey] = list;
    this.flush();
    return updatedPos;
  }

  public deletePosition(id: string): boolean {
    if (!this.isLoaded) this.ensureStorage();
    let deleted = false;
    for (const [sym, list] of Object.entries(this.cache)) {
      const filtered = list.filter((p) => p.id !== id);
      if (filtered.length !== list.length) {
        this.cache[sym] = filtered;
        deleted = true;
      }
    }
    if (deleted) {
      this.flush();
    }
    return deleted;
  }

  public clearPositions(symbol?: string): void {
    if (!this.isLoaded) this.ensureStorage();
    if (symbol) {
      const symKey = this.canonicalSymbol(symbol);
      delete this.cache[symKey];
    } else {
      this.cache = {};
    }
    this.flush();
  }
}

export const positionStorageService = new PositionStorageService();
