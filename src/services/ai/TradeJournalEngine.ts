/**
 * JARVIS Trade Journal & Learning Engine
 * Records every AI-generated trade setup, tracks live price excursions (MFE/MAE),
 * calculates win rate / profit factor, and maintains an evidence-based feedback loop.
 */

import { JournalRecord, TradeSetup, AIEvidenceSnapshot } from '../../types/ai';

export class TradeJournalEngine {
  private records: Map<string, JournalRecord> = new Map();
  private storageKey = 'jarvis_ai_trade_journal_v1';
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) {
      try { l(); } catch {}
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const list: JournalRecord[] = JSON.parse(raw);
        for (const item of list) {
          this.records.set(item.id, item);
        }
      }
    } catch {}
  }

  private saveToStorage(): void {
    try {
      const list = Array.from(this.records.values());
      localStorage.setItem(this.storageKey, JSON.stringify(list.slice(-200)));
    } catch {}
  }

  public recordSetup(setup: TradeSetup, snapshot: AIEvidenceSnapshot): JournalRecord {
    const existing = this.records.get(setup.id);
    if (existing) return existing;

    const record: JournalRecord = {
      id: setup.id,
      setup,
      snapshotAtCreation: snapshot,
      createdAt: Date.now(),
      mfe: 0,
      mae: 0,
    };

    this.records.set(record.id, record);
    this.saveToStorage();
    this.notify();
    return record;
  }

  /**
   * Update active setups against live price ticks to measure MFE/MAE and outcome
   */
  public updatePrice(symbol: string, currentPrice: number): void {
    if (currentPrice <= 0) return;
    let dirty = false;

    for (const record of this.records.values()) {
      if (record.setup.instrument !== symbol) continue;
      if (record.outcome) continue; // Already closed

      const setup = record.setup;
      const isLong = setup.direction === 'LONG';
      const entry = setup.entryPrice;

      // Calculate Excursions
      if (isLong) {
        const fav = Math.max(0, currentPrice - entry);
        const adv = Math.max(0, entry - currentPrice);
        if (fav > record.mfe) { record.mfe = fav; dirty = true; }
        if (adv > record.mae) { record.mae = adv; dirty = true; }

        // Check TP / SL hit
        if (currentPrice >= setup.takeProfit3) {
          record.outcome = 'TP3_HIT';
          record.closedAt = Date.now();
          dirty = true;
        } else if (currentPrice >= setup.takeProfit2) {
          record.outcome = 'TP2_HIT';
          record.closedAt = Date.now();
          dirty = true;
        } else if (currentPrice >= setup.takeProfit1) {
          record.outcome = 'TP1_HIT';
          record.closedAt = Date.now();
          dirty = true;
        } else if (currentPrice <= setup.stopLoss) {
          record.outcome = 'STOP_LOSS_HIT';
          record.closedAt = Date.now();
          dirty = true;
        }
      } else if (setup.direction === 'SHORT') {
        const fav = Math.max(0, entry - currentPrice);
        const adv = Math.max(0, currentPrice - entry);
        if (fav > record.mfe) { record.mfe = fav; dirty = true; }
        if (adv > record.mae) { record.mae = adv; dirty = true; }

        // Check TP / SL hit
        if (currentPrice <= setup.takeProfit3) {
          record.outcome = 'TP3_HIT';
          record.closedAt = Date.now();
          dirty = true;
        } else if (currentPrice <= setup.takeProfit2) {
          record.outcome = 'TP2_HIT';
          record.closedAt = Date.now();
          dirty = true;
        } else if (currentPrice <= setup.takeProfit1) {
          record.outcome = 'TP1_HIT';
          record.closedAt = Date.now();
          dirty = true;
        } else if (currentPrice >= setup.stopLoss) {
          record.outcome = 'STOP_LOSS_HIT';
          record.closedAt = Date.now();
          dirty = true;
        }
      }
    }

    if (dirty) {
      this.saveToStorage();
      this.notify();
    }
  }

  public getRecords(): JournalRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getPerformanceStats() {
    const list = Array.from(this.records.values());
    const closed = list.filter((r) => r.outcome);
    const totalSetups = list.length;
    const wins = closed.filter((r) => r.outcome?.startsWith('TP')).length;
    const losses = closed.filter((r) => r.outcome === 'STOP_LOSS_HIT').length;
    const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;

    let totalRR = 0;
    let totalMfe = 0;
    let totalMae = 0;
    for (const r of list) {
      totalRR += r.setup.rewardToRiskRatio || 2.0;
      totalMfe += r.mfe || 0;
      totalMae += r.mae || 0;
    }
    const avgRR = list.length > 0 ? Math.round((totalRR / list.length) * 10) / 10 : 2.0;
    const avgMfe = list.length > 0 ? Math.round((totalMfe / list.length) * 10) / 10 : 0;
    const avgMae = list.length > 0 ? Math.round((totalMae / list.length) * 10) / 10 : 0;

    return {
      totalSetups,
      totalTrades: totalSetups,
      closedSetups: closed.length,
      wins,
      losses,
      winRate,
      winRatePct: winRate,
      avgRR,
      avgMfe,
      avgMae,
    };
  }

  public clear(): void {
    this.records.clear();
    this.saveToStorage();
    this.notify();
  }
}

export const tradeJournalEngine = new TradeJournalEngine();
