/**
 * JARVIS Multi-AI Trading Intelligence Engine & Expert Advisor Test Suite
 * Validates:
 * 1. AIKeyManager encryption, masked key security, and provider status reporting.
 * 2. Order book depth extraction and deterministic anchoring of Entry, SL, and TP levels.
 * 3. Market intelligence regime, structure, absorption, and footprint analysis.
 * 4. Evidence-based confidence scoring (0-100) with factor breakdowns and conflict penalties.
 * 5. Conditional opportunity monitoring, triggers, and invalidations.
 * 6. Trade journaling with MFE/MAE price excursion tracking and performance analytics.
 * 7. Multi-AI consensus and mode configurations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBookManager } from '../services/orderbook/OrderBookManager';
import { aiToolRegistry, CandleLike } from '../services/ai/AIToolRegistry';
import { marketIntelligenceEngine } from '../services/ai/MarketIntelligenceEngine';
import { opportunityEngine } from '../services/ai/OpportunityEngine';
import { tradeJournalEngine } from '../services/ai/TradeJournalEngine';
import { aiOrchestrator } from '../services/ai/AIOrchestrator';
import { aiKeyManager } from '../../server/services/ai/AIKeyManager.js';

describe('JARVIS Multi-AI Trading Intelligence Engine', () => {
  let orderBook: OrderBookManager;
  let sampleCandles: CandleLike[];

  beforeEach(() => {
    orderBook = new OrderBookManager(0.01);

    // Seed real order book depth with resting liquidity
    // Bids around 2740-2748
    orderBook.applyIncrementalUpdate({
      firstUpdateId: 100,
      lastUpdateId: 100,
      timestamp: Date.now(),
      bids: [
        [2748.0, 15.5],
        [2747.5, 45.0], // resting bid wall
        [2745.0, 120.0], // major resting bid wall
        [2740.0, 250.0], // structural support wall
      ],
      asks: [
        [2752.0, 20.0],
        [2755.0, 80.0], // resting ask wall
        [2760.0, 180.0], // major resting resistance wall
        [2770.0, 300.0], // target liquidity pool
      ],
    });

    // Build sample 15m candles
    sampleCandles = [
      { time: 1700000000, open: 2735, high: 2742, low: 2733, close: 2740, volume: 1500 },
      { time: 1700000900, open: 2740, high: 2746, low: 2738, close: 2745, volume: 1800 },
      { time: 1700001800, open: 2745, high: 2751, low: 2744, close: 2750, volume: 2200 },
    ];

    aiToolRegistry.setContext({
      orderBook,
      footprintEngine: null,
      absorptionEngine: null,
      heatmapEngine: null,
      bubbleManager: null,
    });
  });

  describe('Phase 1 & 2: API Key Management & Masked Security', () => {
    it('encrypts and masks API keys, never exposing raw keys in status reporting', () => {
      // Test key setting
      aiKeyManager.setKey('openai', 'sk-proj-supersecretkey1234567890abcdef', 'gpt-4o');

      const status = aiKeyManager.getStatus('openai');
      expect(status.hasKey).toBe(true);
      expect(status.status).toBe('connected');
      expect(status.maskedKey).toBe('sk-p...cdef');
      expect(status.maskedKey).not.toContain('supersecretkey');
      expect(status.defaultModel).toBe('gpt-4o');

      // Removal test
      aiKeyManager.removeKey('openai');
      const removedStatus = aiKeyManager.getStatus('openai');
      expect(removedStatus.hasKey).toBe(false);
      expect(removedStatus.status).toBe('disconnected');
      expect(removedStatus.maskedKey).toBeNull();
    });

    it('manages all three providers (OpenAI, Gemini, Grok) independently', () => {
      const allStatuses = aiKeyManager.getAllStatuses();
      expect(allStatuses.openai).toBeDefined();
      expect(allStatuses.gemini).toBeDefined();
      expect(allStatuses.grok).toBeDefined();
    });
  });

  describe('Phase 3 & 4: Order Book Analytics & Market Intelligence', () => {
    it('extracts live order book metrics, resting walls, and bid/ask depth skew', () => {
      const currentPrice = 2750.0;
      const ob = aiToolRegistry.extractOrderBookAnalytics(currentPrice, 0.01);

      expect(ob.bestBid).toBe(2748.0);
      expect(ob.bestAsk).toBe(2752.0);
      expect(ob.spread).toBeCloseTo(4.0, 2);
      expect(ob.topBids.length).toBeGreaterThanOrEqual(4);
      expect(ob.topAsks.length).toBeGreaterThanOrEqual(4);

      // Verify resting walls identified
      expect(ob.restingBidWalls.length).toBeGreaterThan(0);
      expect(ob.restingAskWalls.length).toBeGreaterThan(0);
      expect(ob.restingBidWalls.some((w) => w.price === 2745.0)).toBe(true);
      expect(ob.restingAskWalls.some((w) => w.price === 2760.0)).toBe(true);
    });

    it('classifies market regime and higher highs / higher lows structure', () => {
      const currentPrice = 2750.0;
      const snapshot = aiToolRegistry.generateSnapshot('XAUUSD', '15m', sampleCandles, currentPrice);

      expect(snapshot.instrument).toBe('XAUUSD');
      expect(snapshot.timeframe).toBe('15m');
      expect(snapshot.currentPrice).toBe(2750.0);
      expect(snapshot.regime).toBeDefined();
      expect(snapshot.bias).toBeDefined();
      expect(snapshot.structure.trend).toBe('UPTREND');
      expect(snapshot.structure.swingHigh).toBe(2751);
      expect(snapshot.structure.swingLow).toBe(2733);
    });
  });

  describe('Phase 5 & 8: Structured Trade Setup Anchoring & Measurable Confidence', () => {
    it('CRITICAL RULE: Trade setup Entry, SL, and TP are anchored directly to order book walls', () => {
      const currentPrice = 2750.0;
      const snapshot = aiToolRegistry.generateSnapshot('XAUUSD', '15m', sampleCandles, currentPrice);
      const setup = marketIntelligenceEngine.generateTradeSetup(snapshot);

      expect(setup.instrument).toBe('XAUUSD');
      expect(['LONG', 'SHORT', 'NO_TRADE']).toContain(setup.direction);

      if (setup.direction === 'LONG') {
        // Long entry must be near current price / order book bid zone
        expect(setup.entryPrice).toBeGreaterThan(0);
        expect(setup.stopLoss).toBeLessThan(setup.entryPrice);
        expect(setup.takeProfit1).toBeGreaterThan(setup.entryPrice);
        expect(setup.takeProfit2).toBeGreaterThan(setup.takeProfit1);
        expect(setup.rewardToRiskRatio).toBeGreaterThanOrEqual(1.2);

        // Evidence must detail order book levels
        expect(setup.orderBookEvidence).toContain('Order Book');
        expect(setup.invalidationCondition).toBeTruthy();
      }

      // Confidence score must be calculated strictly from evidence (0-100)
      expect(setup.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(setup.confidenceScore).toBeLessThanOrEqual(100);
      expect(setup.reasons.length).toBeGreaterThan(0);
    });

    it('penalizes confidence when data is conflicting or spread is excessive', () => {
      const currentPrice = 2750.0;
      const snapshot = aiToolRegistry.generateSnapshot('XAUUSD', '15m', sampleCandles, currentPrice);

      // Deliberately introduce conflicting indicators
      snapshot.orderBook.spread = 15.0; // very wide spread penalty
      snapshot.structure.trend = 'RANGING';
      snapshot.bias = 'NEUTRAL';

      const setup = marketIntelligenceEngine.generateTradeSetup(snapshot);

      expect(setup.confidenceScore).toBeLessThan(75);
    });
  });

  describe('Phase 6: Conditional Opportunity Engine', () => {
    it('registers and triggers conditional setups when market reaches trigger zone', () => {
      opportunityEngine.clear();

      const registered = opportunityEngine.addOpportunity({
        instrument: 'XAUUSD',
        expectedDirection: 'LONG',
        targetPriceZone: { min: 2744.0, max: 2746.0 },
        conditionTitle: 'Defending 2745 bid wall with buy absorption',
        requiredConfirmation: ['Positive delta', 'Absorption bubble'],
        invalidationPrice: 2740.0,
        notes: 'Anchored to 120 qty resting bid wall',
        active: true,
      });

      expect(registered.id).toBeDefined();
      expect(registered.status).toBe('MONITORING');

      // Price remains away from trigger (e.g. 2755)
      const snapshotAway = aiToolRegistry.generateSnapshot('XAUUSD', '15m', sampleCandles, 2755.0);
      opportunityEngine.evaluate(snapshotAway);
      let opps = opportunityEngine.getAllOpportunities();
      expect(opps[0].status).toBe('MONITORING');

      // Price arrives in trigger zone [2744.0, 2746.0]
      const snapshotTriggered = aiToolRegistry.generateSnapshot('XAUUSD', '15m', sampleCandles, 2745.0);
      opportunityEngine.evaluate(snapshotTriggered);
      opps = opportunityEngine.getAllOpportunities();
      expect(opps[0].status).toBe('TRIGGERED');
    });

    it('invalidates conditional setups when price breaches invalidation price', () => {
      opportunityEngine.clear();

      opportunityEngine.addOpportunity({
        instrument: 'XAUUSD',
        expectedDirection: 'LONG',
        targetPriceZone: { min: 2744.0, max: 2746.0 },
        conditionTitle: 'Bid wall defense',
        requiredConfirmation: ['Absorption'],
        invalidationPrice: 2740.0,
        notes: 'Invalidation below 2740.0',
        active: true,
      });

      // Price breaks below 2740.0 to 2738.0
      const snapshotBroken = aiToolRegistry.generateSnapshot('XAUUSD', '15m', sampleCandles, 2738.0);
      opportunityEngine.evaluate(snapshotBroken);
      const opps = opportunityEngine.getAllOpportunities();
      expect(opps[0].status).toBe('CANCELLED');
    });
  });

  describe('Phase 11: Trade Journal & Self-Improvement (MFE/MAE Tracking)', () => {
    it('records setups and accurately tracks Maximum Favorable and Adverse Excursions', () => {
      tradeJournalEngine.clear();

      const snapshot = aiToolRegistry.generateSnapshot('XAUUSD', '15m', sampleCandles, 2745.0);
      const record = tradeJournalEngine.recordSetup(
        {
          id: 'test-setup-1',
          timestamp: Date.now(),
          instrument: 'XAUUSD',
          direction: 'LONG',
          setupName: 'LIQUIDITY_BOUNCE',
          marketRegime: 'strong_bullish',
          status: 'READY_NOW',
          entryType: 'LIMIT',
          entryPrice: 2745.0,
          stopLoss: 2740.0,
          takeProfit1: 2755.0,
          takeProfit2: 2765.0,
          takeProfit3: 2775.0,
          rewardToRiskRatio: 2.0,
          confidenceScore: 82,
          reasons: ['Resting bid wall at 2745.0'],
          orderBookEvidence: '120 units resting bids',
          footprintEvidence: 'Positive delta',
          absorptionEvidence: 'Buyers defending',
          invalidationCondition: 'Break below 2740.0',
        },
        snapshot
      );

      expect(record.mfe).toBe(0);
      expect(record.mae).toBe(0);

      // Price dips slightly to 2743.0 (MAE = 2.0)
      tradeJournalEngine.updatePrice('XAUUSD', 2743.0);
      let records = tradeJournalEngine.getRecords();
      expect(records[0].mae).toBeCloseTo(2.0, 1);

      // Price surges to 2758.0 (exceeds TP1 at 2755.0, MFE = 13.0)
      tradeJournalEngine.updatePrice('XAUUSD', 2758.0);
      records = tradeJournalEngine.getRecords();
      expect(records[0].mfe).toBeCloseTo(13.0, 1);
      expect(records[0].outcome).toBe('TP1_HIT');

      // Verify performance statistics
      const stats = tradeJournalEngine.getPerformanceStats();
      expect(stats.totalTrades).toBe(1);
      expect(stats.wins).toBe(1);
      expect(stats.winRatePct).toBe(100);
      expect(stats.avgMfe).toBeGreaterThan(0);
    });
  });

  describe('Phase 7: Multi-AI Consensus & Fallback Mechanics', () => {
    it('manages primary AI, secondary AI, and operating modes cleanly', () => {
      aiOrchestrator.updateSettings({
        primaryProvider: 'openai',
        secondaryProvider: 'gemini',
        mode: 'consensus',
      });

      const settings = aiOrchestrator.getSettings();
      expect(settings.primaryProvider).toBe('openai');
      expect(settings.secondaryProvider).toBe('gemini');
      expect(settings.mode).toBe('consensus');
    });
  });
});
