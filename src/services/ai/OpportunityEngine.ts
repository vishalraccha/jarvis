/**
 * JARVIS Conditional Opportunity Engine
 * Tracks forward-looking conditional setups and monitors live market streams
 * to trigger notifications when confirmed order-flow conditions materialize.
 */

import { ConditionalOpportunity, AIEvidenceSnapshot, TradeSetup } from '../../types/ai';

export type OpportunityListener = (event: { type: 'triggered' | 'invalidated' | 'added'; opportunity: ConditionalOpportunity; setup?: TradeSetup }) => void;

export class OpportunityEngine {
  private opportunities: Map<string, ConditionalOpportunity> = new Map();
  private listeners: Set<OpportunityListener> = new Set();
  private lastAlertTimes: Map<string, number> = new Map();

  public subscribe(listener: OpportunityListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: { type: 'triggered' | 'invalidated' | 'added'; opportunity: ConditionalOpportunity; setup?: TradeSetup }) {
    for (const l of this.listeners) {
      try { l(event); } catch {}
    }
  }

  public getActiveOpportunities(): ConditionalOpportunity[] {
    return Array.from(this.opportunities.values()).filter((o) => o.active && o.status === 'MONITORING');
  }

  public getAllOpportunities(): ConditionalOpportunity[] {
    return Array.from(this.opportunities.values());
  }

  public addOpportunity(opp: Omit<ConditionalOpportunity, 'id' | 'createdAt' | 'status'>): ConditionalOpportunity {
    const id = `opp_${opp.instrument}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fullOpp: ConditionalOpportunity = {
      ...opp,
      id,
      createdAt: Date.now(),
      status: 'MONITORING',
    };
    this.opportunities.set(id, fullOpp);
    this.notify({ type: 'added', opportunity: fullOpp });
    return fullOpp;
  }

  public cancelOpportunity(id: string): void {
    const opp = this.opportunities.get(id);
    if (opp) {
      opp.active = false;
      opp.status = 'CANCELLED';
      this.notify({ type: 'invalidated', opportunity: opp });
    }
  }

  /**
   * Monitor live price and order book snapshot against active opportunities
   */
  public evaluate(snapshot: AIEvidenceSnapshot): void {
    const currentPrice = snapshot.currentPrice;
    if (currentPrice <= 0) return;

    const now = Date.now();

    for (const opp of this.getActiveOpportunities()) {
      if (opp.instrument !== snapshot.instrument) continue;

      // 1. Check Invalidation
      if (opp.expectedDirection === 'LONG' && currentPrice < opp.invalidationPrice) {
        opp.active = false;
        opp.status = 'CANCELLED';
        this.notify({ type: 'invalidated', opportunity: opp });
        continue;
      }
      if (opp.expectedDirection === 'SHORT' && currentPrice > opp.invalidationPrice) {
        opp.active = false;
        opp.status = 'CANCELLED';
        this.notify({ type: 'invalidated', opportunity: opp });
        continue;
      }

      // 2. Check if price is within target trigger zone
      const inZone = currentPrice >= opp.targetPriceZone.min && currentPrice <= opp.targetPriceZone.max;
      if (inZone) {
        // Check confirmation: Absorption or Footprint Delta confirmation
        let confirmed = false;
        if (opp.expectedDirection === 'LONG') {
          if (snapshot.absorption.buyersAbsorbingAtSupport || snapshot.orderBook.depthImbalancePercent >= 15 || snapshot.footprint.candleDelta > 0) {
            confirmed = true;
          }
        } else {
          if (snapshot.absorption.sellersAbsorbingAtResistance || snapshot.orderBook.depthImbalancePercent <= -15 || snapshot.footprint.candleDelta < 0) {
            confirmed = true;
          }
        }

        if (confirmed) {
          // Prevent spam: min 5 minutes between alerts for the same opportunity
          const lastAlert = this.lastAlertTimes.get(opp.id) || 0;
          if (now - lastAlert >= 300000) {
            this.lastAlertTimes.set(opp.id, now);
            opp.status = 'TRIGGERED';
            opp.active = false;
            this.notify({ type: 'triggered', opportunity: opp });
          }
        }
      }
    }
  }

  public clear(): void {
    this.opportunities.clear();
    this.lastAlertTimes.clear();
  }
}

export const opportunityEngine = new OpportunityEngine();
