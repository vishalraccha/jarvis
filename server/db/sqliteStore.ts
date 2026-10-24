/**
 * JARVIS SQLite Durable Historical Store (Pure WebAssembly - Zero C++ Dependencies)
 * Fast, reliable, durable historical storage with range indexing
 */

import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

export interface StoredCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class SQLiteStore {
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private dbPath: string;
  private isDirty = false;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private isInitializing = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'jarvis.db');
  }

  async init(): Promise<void> {
    if (this.db) return;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return;
    }

    this.isInitializing = true;
    try {
      this.SQL = await initSqlJs();

      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Load existing database from disk if it exists
      if (fs.existsSync(this.dbPath)) {
        try {
          const fileBuffer = fs.readFileSync(this.dbPath);
          this.db = new this.SQL.Database(fileBuffer);
          console.log(`[SQLiteStore] Loaded existing database from ${this.dbPath} (${fileBuffer.byteLength} bytes)`);
        } catch (err) {
          console.warn(`[SQLiteStore] Could not read existing DB file, creating fresh DB:`, err);
          this.db = new this.SQL.Database();
        }
      } else {
        this.db = new this.SQL.Database();
        console.log(`[SQLiteStore] Initialized new in-memory SQLite database (target: ${this.dbPath})`);
      }

      // Initialize schema & indexes
      this.db.run(`
        CREATE TABLE IF NOT EXISTS candles (
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          time INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL DEFAULT 0,
          PRIMARY KEY (symbol, timeframe, time)
        );
        CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(symbol, timeframe, time);
      `);

      this.scheduleSave();
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Insert or update a batch of candles in a single transaction
   */
  insertCandles(symbol: string, timeframe: string, candles: StoredCandle[]): number {
    if (!this.db || candles.length === 0) return 0;

    const sym = symbol.toUpperCase();
    const tf = timeframe.toLowerCase();

    this.db.run('BEGIN TRANSACTION;');
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO candles (symbol, timeframe, time, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let inserted = 0;
    try {
      for (const c of candles) {
        if (!Number.isFinite(c.time) || c.time <= 0 || !Number.isFinite(c.close)) continue;
        stmt.run([
          sym,
          tf,
          Math.floor(c.time),
          c.open,
          c.high,
          c.low,
          c.close,
          c.volume || 0,
        ]);
        inserted++;
      }
      this.db.run('COMMIT;');
      this.isDirty = true;
      this.scheduleSave();
    } catch (err) {
      try {
        this.db.run('ROLLBACK;');
      } catch {}
      console.error('[SQLiteStore] Transaction insert failed:', err);
    } finally {
      stmt.free();
    }

    return inserted;
  }

  /**
   * Query candles within a time range, ordered chronologically
   */
  getCandles(
    symbol: string,
    timeframe: string,
    startTime?: number,
    endTime?: number,
    limit: number = 1000
  ): StoredCandle[] {
    if (!this.db) return [];

    const sym = symbol.toUpperCase();
    const tf = timeframe.toLowerCase();
    const maxLimit = Math.min(Math.max(1, limit), 2000);

    const hasStartTime = startTime !== undefined && Number.isFinite(startTime) && startTime > 0;
    const hasEndTime = endTime !== undefined && Number.isFinite(endTime) && endTime > 0;

    let whereConditions = `WHERE symbol = $sym AND timeframe = $tf`;
    const params: Record<string, any> = { $sym: sym, $tf: tf, $limit: maxLimit };

    if (hasStartTime) {
      whereConditions += ` AND time >= $start`;
      params.$start = Math.floor(startTime!);
    }
    if (hasEndTime) {
      whereConditions += ` AND time <= $end`;
      params.$end = Math.floor(endTime!);
    }

    // If querying forward from startTime (and no endTime), order ASC.
    // Otherwise (latest candles or reverse paging before endTime), grab latest DESC then order ASC.
    let query: string;
    if (hasStartTime && !hasEndTime) {
      query = `
        SELECT time, open, high, low, close, volume
        FROM candles
        ${whereConditions}
        ORDER BY time ASC LIMIT $limit
      `;
    } else {
      query = `
        SELECT time, open, high, low, close, volume FROM (
          SELECT time, open, high, low, close, volume
          FROM candles
          ${whereConditions}
          ORDER BY time DESC LIMIT $limit
        ) ORDER BY time ASC
      `;
    }

    try {
      const stmt = this.db.prepare(query);
      stmt.bind(params);
      const results: StoredCandle[] = [];

      while (stmt.step()) {
        const row = stmt.getAsObject() as any;
        results.push({
          time: Number(row.time),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume || 0),
        });
      }
      stmt.free();
      return results;
    } catch (err) {
      console.error('[SQLiteStore] Query execution error:', err);
      return [];
    }
  }

  /**
   * Retrieve total record count and oldest/newest timestamps
   */
  getStats(): {
    totalRecords: number;
    symbolCounts: Record<string, number>;
    dbSizeBytes: number;
  } {
    if (!this.db) {
      return { totalRecords: 0, symbolCounts: {}, dbSizeBytes: 0 };
    }

    try {
      const totalRes = this.db.exec('SELECT COUNT(*) as total FROM candles');
      const total = (totalRes[0]?.values[0]?.[0] as number) || 0;

      const groupRes = this.db.exec('SELECT symbol || "_" || timeframe, COUNT(*) FROM candles GROUP BY symbol, timeframe');
      const symbolCounts: Record<string, number> = {};
      if (groupRes[0]?.values) {
        for (const row of groupRes[0].values) {
          symbolCounts[String(row[0])] = Number(row[1]);
        }
      }

      let size = 0;
      if (fs.existsSync(this.dbPath)) {
        size = fs.statSync(this.dbPath).size;
      }

      return {
        totalRecords: total,
        symbolCounts,
        dbSizeBytes: size,
      };
    } catch {
      return { totalRecords: 0, symbolCounts: {}, dbSizeBytes: 0 };
    }
  }

  /**
   * Debounced asynchronous disk persistence
   */
  private scheduleSave(): void {
    if (this.saveDebounceTimer) return;
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.flushToDisk();
    }, 2000);
  }

  /**
   * Flush SQLite export to disk synchronously/immediately
   */
  flushToDisk(): void {
    if (!this.db || !this.isDirty) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const tmpPath = `${this.dbPath}.tmp`;
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, this.dbPath);
      this.isDirty = false;
    } catch (err) {
      console.error('[SQLiteStore] Failed to flush database to disk:', err);
    }
  }

  close(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    this.flushToDisk();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const sqliteStore = new SQLiteStore();
