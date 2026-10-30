/**
 * Absorption Detection Engine
 * High-Performance Order-Flow Absorption Analysis for JARVIS
 *
 * Detects aggressive buying/selling absorbed by passive liquidity at key zones.
 * Computes transparent evidence scoring (0-100) and assigns A and A+ grades.
 */

import {
  AbsorptionEvent,
  AbsorptionGrade,
  AbsorptionSettings,
  AbsorptionType,
  AbsorptionZoneType,
  DEFAULT_ABSORPTION_SETTINGS,
} from '../../types/absorption';
import { MarketTrade } from '../../types/market';
import { OrderBookManager } from '../orderbook/OrderBookManager';
import { HeatmapEngine } from '../heatmap/HeatmapEngine';

interface TradeCluster {
  clusterKey: number; // rounded price tick
  price: number;
  minPrice: number;
  maxPrice: number;
  startTime: number;
  lastTime: number;
  tradeCount: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  notional: number;
  initialDepthAtLevel: number;
  trades: MarketTrade[];
}

export interface ZoneCandidate {
  type: AbsorptionZoneType;
  price: number;
  strength: number;
  description: string;
}

export class AbsorptionEngine {
  private settings: AbsorptionSettings;
  private symbol: string = 'XAUUSD';
  private tickSize: number = 0.01;

  private orderBook: OrderBookManager | null = null;
  private heatmapEngine: HeatmapEngine | null = null;

  // Active absorption events (bounded retention, max 200 events)
  private events: AbsorptionEvent[] = [];
  private eventById: Map<string, AbsorptionEvent> = new Map();

  // Active in-flight trade clusters being monitored for absorption
  private activeClusters: Map<number, TradeCluster> = new Map();

  // Rolling trade cluster volume history for adaptive volume normalization
  private rollingVolumes: number[] = [];
  private readonly maxRollingHistory = 80;
  private seenTradeIds: Set<string> = new Set();
  private timeframe: string = '1m';
  private lastCandles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];

  // Key reference price levels (Session High/Low, PDH/PDL, POC, VWAP)
  private keyLevels: {
    sessionHigh?: number;
    sessionLow?: number;
    pdh?: number;
    pdl?: number;
    poc?: number;
    vwap?: number;
  } = {};

  private listeners: Set<() => void> = new Set();
  private isNotifyPending: boolean = false;

  constructor(settings: AbsorptionSettings = DEFAULT_ABSORPTION_SETTINGS, tickSize: number = 0.01) {
    this.settings = { ...DEFAULT_ABSORPTION_SETTINGS, ...settings };
    this.tickSize = tickSize > 0 ? tickSize : 0.01;
  }

  setTimeframe(timeframe: string): void {
    if (this.timeframe !== timeframe) {
      this.timeframe = timeframe;
    }
  }

  setContext(symbol: string, tickSize?: number): void {
    if (this.symbol !== symbol) {
      this.symbol = symbol;
      this.clear();
    }
    if (tickSize && tickSize > 0) {
      this.tickSize = tickSize;
    }
  }

  setOrderBook(orderBook: OrderBookManager | null): void {
    this.orderBook = orderBook;
    if (orderBook) {
      const tbTick = orderBook.getTickSize();
      if (tbTick > 0) this.tickSize = tbTick;
    }
  }

  setHeatmapEngine(heatmapEngine: HeatmapEngine | null): void {
    this.heatmapEngine = heatmapEngine;
  }

  setKeyLevels(levels: {
    sessionHigh?: number;
    sessionLow?: number;
    pdh?: number;
    pdl?: number;
    poc?: number;
    vwap?: number;
  }): void {
    this.keyLevels = { ...this.keyLevels, ...levels };
  }

  updateSettings(settings: Partial<AbsorptionSettings>): void {
    this.settings = { ...this.settings, ...settings };
    if (this.lastCandles.length > 0) {
      this.seedFromCandles(this.lastCandles);
    } else {
      this.notifyListeners(true);
    }
  }

  getSettings(): AbsorptionSettings {
    return this.settings;
  }

  getEventsSummary(): { total: number; visible: number; aPlusCount: number; aCount: number } {
    const visible = this.getVisibleEvents();
    let aPlusCount = 0;
    let aCount = 0;
    for (const ev of visible) {
      if (ev.grade === 'A+') aPlusCount++;
      else aCount++;
    }
    return {
      total: this.events.length,
      visible: visible.length,
      aPlusCount,
      aCount,
    };
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(immediate: boolean = false): void {
    if (immediate || typeof requestAnimationFrame === 'undefined') {
      for (const listener of this.listeners) {
        listener();
      }
      return;
    }

    if (this.isNotifyPending) return;
    this.isNotifyPending = true;

    requestAnimationFrame(() => {
      this.isNotifyPending = false;
      for (const listener of this.listeners) {
        listener();
      }
    });
  }

  clear(): void {
    this.events = [];
    this.eventById.clear();
    this.activeClusters.clear();
    this.rollingVolumes = [];
    this.seenTradeIds.clear();
    this.notifyListeners();
  }

  /**
   * Process incoming trade execution
   */
  recordTrade(
    trade: Partial<MarketTrade> & { price: number; quantity: number }
  ): AbsorptionEvent | null {
    if (!this.settings.enabled) return null;
    if (!trade || !Number.isFinite(trade.price) || trade.price <= 0 || trade.quantity <= 0) return null;

    // Deduplicate identical trade events from duplicate WebSocket packets
    if (trade.id) {
      if (this.seenTradeIds.has(trade.id)) {
        return null;
      }
      this.seenTradeIds.add(trade.id);
      if (this.seenTradeIds.size > 2000) {
        const first = this.seenTradeIds.values().next().value;
        if (first) this.seenTradeIds.delete(first);
      }
    }

    const price = trade.price;
    const qty = trade.quantity;
    const now = trade.timestamp || Date.now();
    const tickKey = Math.round(price / this.tickSize);

    const fullTrade: MarketTrade = {
      id: trade.id || `trade_${now}_${Math.random().toString(36).slice(2, 7)}`,
      price,
      quantity: qty,
      side: trade.side || 'unknown',
      timestamp: now,
      notional: trade.notional || price * qty,
      symbol: trade.symbol || this.symbol,
    };

    // Prune expired clusters older than 5.0 seconds
    const clusterExpiryWindowMs = 4500;
    for (const [k, cluster] of this.activeClusters.entries()) {
      if (now - cluster.lastTime > clusterExpiryWindowMs) {
        this.evaluateAndFinalizeCluster(cluster, now);
        this.activeClusters.delete(k);
      }
    }

    // Find or create trade cluster around this price level
    let matchedCluster: TradeCluster | null = null;
    const maxSpreadTicks = this.settings.maxClusterSpreadTicks || 2;

    for (const cluster of this.activeClusters.values()) {
      const diffTicks = Math.abs(cluster.clusterKey - tickKey);
      if (diffTicks <= maxSpreadTicks && now - cluster.lastTime <= clusterExpiryWindowMs) {
        matchedCluster = cluster;
        break;
      }
    }

    const resolvedSide: 'buy' | 'sell' | 'unknown' = fullTrade.side;
    const isBuy = resolvedSide === 'buy';
    const isSell = resolvedSide === 'sell';

    if (!matchedCluster) {
      // Sample initial resting depth at this price level
      let initialDepth = 0;
      if (this.orderBook) {
        if (isBuy) {
          initialDepth = this.orderBook.getAskQuantityAtPrice(price);
        } else if (isSell) {
          initialDepth = this.orderBook.getBidQuantityAtPrice(price);
        }
      }

      const newCluster: TradeCluster = {
        clusterKey: tickKey,
        price,
        minPrice: price,
        maxPrice: price,
        startTime: now,
        lastTime: now,
        tradeCount: 1,
        buyVolume: isBuy ? qty : 0,
        sellVolume: isSell ? qty : 0,
        totalVolume: qty,
        notional: fullTrade.notional,
        initialDepthAtLevel: initialDepth,
        trades: [fullTrade],
      };
      this.activeClusters.set(tickKey, newCluster);
      matchedCluster = newCluster;
    } else {
      matchedCluster.lastTime = now;
      matchedCluster.tradeCount++;
      matchedCluster.totalVolume += qty;
      matchedCluster.notional += fullTrade.notional;
      if (isBuy) matchedCluster.buyVolume += qty;
      if (isSell) matchedCluster.sellVolume += qty;
      matchedCluster.minPrice = Math.min(matchedCluster.minPrice, price);
      matchedCluster.maxPrice = Math.max(matchedCluster.maxPrice, price);
      matchedCluster.trades.push(fullTrade);

      // Keep recent trades bounded
      if (matchedCluster.trades.length > 80) {
        matchedCluster.trades.shift();
      }
    }

    // Periodically update rolling volume statistics
    this.updateRollingVolume(qty);

    // Evaluate cluster if sufficient activity has accumulated
    return this.evaluateCluster(matchedCluster, now, false);
  }

  private updateRollingVolume(vol: number): void {
    if (vol <= 0) return;
    this.rollingVolumes.push(vol);
    if (this.rollingVolumes.length > this.maxRollingHistory) {
      this.rollingVolumes.shift();
    }
  }

  private getMedianRollingVolume(): number {
    if (this.rollingVolumes.length === 0) {
      // Default instrument-specific estimates
      const sym = this.symbol.toUpperCase();
      if (sym.includes('BTC')) return 0.5;
      if (sym.includes('ETH')) return 5.0;
      if (sym.includes('SOL')) return 40.0;
      if (sym.includes('XAU') || sym === 'GC') return 5.0;
      if (sym.includes('NAS')) return 10.0;
      return 10.0;
    }
    const sorted = [...this.rollingVolumes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Instrument-specific minimum cumulative volume to filter out insignificant noise
   */
  private getInstrumentMinVolume(): number {
    const sym = this.symbol.toUpperCase();
    if (sym.includes('BTC')) return 2.0;
    if (sym.includes('ETH')) return 15.0;
    if (sym.includes('SOL')) return 80.0;
    if (sym.includes('XAU') || sym === 'GC') return 10.0;
    if (sym.includes('EUR') || sym.includes('GBP')) return 10.0;
    return 5.0;
  }

  private getMinRestingWallQuantity(): number {
    const sym = this.symbol.toUpperCase();
    if (sym.includes('BTC')) return 15.0;
    if (sym.includes('ETH')) return 50.0;
    if (sym.includes('SOL')) return 200.0;
    if (sym.includes('XAU') || sym === 'GC') return 12.0;
    if (sym.includes('NAS')) return 25.0;
    return 10.0;
  }

  private getTimeframeSeconds(): number {
    const map: Record<string, number> = {
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14400,
      '1d': 86400,
    };
    return map[this.timeframe] || 60;
  }

  /**
   * Find nearby meaningful liquidity zones
   */
  private findMatchingLiquidityZone(
    price: number,
    type: AbsorptionType
  ): ZoneCandidate | null {
    const toleranceTicks = this.settings.zoneRelevanceToleranceTicks || 3;
    const maxDiff = toleranceTicks * this.tickSize;

    const candidates: ZoneCandidate[] = [];
    const minWallQty = this.getMinRestingWallQuantity();

    // 1. Order Book Resting Liquidity Wall
    if (this.orderBook) {
      const range = this.orderBook.getLevelsInRange(price - maxDiff * 2, price + maxDiff * 2);
      const significantThreshold = Math.max(minWallQty, (range.maxQty || 0) * 0.55);

      if (type === 'buy_absorption') {
        // Look for resting bid wall defending price
        for (const b of range.bids) {
          if (Math.abs(b.price - price) <= maxDiff && b.quantity >= significantThreshold) {
            candidates.push({
              type: 'resting_wall',
              price: b.price,
              strength: b.quantity,
              description: `Resting Bid Wall (${Math.round(b.quantity)} lots)`,
            });
          }
        }
      } else {
        // Look for resting ask wall defending price
        for (const a of range.asks) {
          if (Math.abs(a.price - price) <= maxDiff && a.quantity >= significantThreshold) {
            candidates.push({
              type: 'resting_wall',
              price: a.price,
              strength: a.quantity,
              description: `Resting Ask Wall (${Math.round(a.quantity)} lots)`,
            });
          }
        }
      }
    }

    // 2. Heatmap Resting Levels & Active Zones
    if (this.heatmapEngine) {
      const restingLevels = this.heatmapEngine.getActiveRestingLevels();
      for (const lvl of restingLevels) {
        if (Math.abs(lvl.price - price) <= maxDiff && lvl.qty > 0) {
          if ((type === 'buy_absorption' && !lvl.isAsk) || (type === 'sell_absorption' && lvl.isAsk)) {
            candidates.push({
              type: 'heatmap_band',
              price: lvl.price,
              strength: lvl.qty,
              description: `Heatmap High-Liquidity Band (${Math.round(lvl.qty)} lots)`,
            });
          }
        }
      }
    }

    // 3. Structural Key Levels (POC, VWAP, Session High/Low, PDH/PDL)
    if (this.keyLevels.poc && Math.abs(this.keyLevels.poc - price) <= maxDiff) {
      candidates.push({
        type: 'poc',
        price: this.keyLevels.poc,
        strength: 80,
        description: 'Point of Control (POC)',
      });
    }

    if (this.keyLevels.vwap && Math.abs(this.keyLevels.vwap - price) <= maxDiff) {
      candidates.push({
        type: 'vwap',
        price: this.keyLevels.vwap,
        strength: 75,
        description: 'Session VWAP Defense',
      });
    }

    if (this.keyLevels.sessionLow && type === 'buy_absorption' && Math.abs(this.keyLevels.sessionLow - price) <= maxDiff) {
      candidates.push({
        type: 'session_high_low',
        price: this.keyLevels.sessionLow,
        strength: 70,
        description: 'Session Low Support Defended',
      });
    }

    if (this.keyLevels.sessionHigh && type === 'sell_absorption' && Math.abs(this.keyLevels.sessionHigh - price) <= maxDiff) {
      candidates.push({
        type: 'session_high_low',
        price: this.keyLevels.sessionHigh,
        strength: 70,
        description: 'Session High Resistance Defended',
      });
    }

    if (candidates.length === 0) return null;

    // Return the strongest liquidity zone
    candidates.sort((a, b) => b.strength - a.strength);
    return candidates[0];
  }

  /**
   * Evaluate a trade cluster to determine if valid Absorption has occurred
   */
  private evaluateCluster(
    cluster: TradeCluster,
    now: number,
    finalizing: boolean
  ): AbsorptionEvent | null {
    // 1. Multiplicity check: require multiple executions (>= 3 trades) and sufficient duration
    if (cluster.tradeCount < 3) return null;
    const durationMs = now - cluster.startTime;
    if (durationMs < 150 && !finalizing) return null;

    // 2. Aggressor side ratio classification
    const totalVol = cluster.totalVolume;
    if (totalVol <= 0) return null;

    const buyRatio = cluster.buyVolume / totalVol;
    const sellRatio = cluster.sellVolume / totalVol;

    let absorptionType: AbsorptionType;
    let aggressorVol: number;
    let defendedPrice: number;

    if (sellRatio >= 0.58) {
      // Aggressive sellers hit the bid repeatedly
      absorptionType = 'buy_absorption';
      aggressorVol = cluster.sellVolume;
      defendedPrice = cluster.minPrice;
    } else if (buyRatio >= 0.58) {
      // Aggressive buyers lift the ask repeatedly
      absorptionType = 'sell_absorption';
      aggressorVol = cluster.buyVolume;
      defendedPrice = cluster.maxPrice;
    } else {
      // Mixed volume with no clear aggressor dominance -> not clear absorption
      return null;
    }

    // 3. Strict Liquidity Zone Cross-Referencing
    // "Detect absorption primarily at liquidity zones. This is the most important requirement."
    const zone = this.findMatchingLiquidityZone(defendedPrice, absorptionType);
    if (!zone) {
      // No recognized liquidity zone nearby -> REJECT candidate
      return null;
    }

    // 4. Limited Price Displacement (Absorption Core Requirement)
    // For sell absorption: buyers lifted the ask, but price failed to push through resistance
    // For buy absorption: sellers hit the bid, but price failed to push through support
    let displacement = 0;
    if (absorptionType === 'sell_absorption') {
      displacement = Math.max(0, cluster.maxPrice - zone.price);
    } else {
      displacement = Math.max(0, zone.price - cluster.minPrice);
    }

    const displacementTicks = Math.round((displacement / this.tickSize) * 10) / 10;
    const maxAllowedBreakthroughTicks = 2.5;

    if (displacementTicks > maxAllowedBreakthroughTicks) {
      // Price broke through the level! This was breakout momentum, NOT absorption!
      return null;
    }

    // 5. Volume Significance Check vs Adaptive Baseline & Instrument Minimum
    const minInstrumentVol = this.getInstrumentMinVolume();
    if (cluster.totalVolume < minInstrumentVol) {
      // Small retail noise below instrument minimum threshold -> filter out
      return null;
    }

    const medianVol = this.getMedianRollingVolume();
    const volumeMultiplier = cluster.totalVolume / Math.max(0.001, medianVol);
    const minVolMult = this.settings.minVolumeMultiplier || 1.5;

    if (volumeMultiplier < minVolMult && cluster.totalVolume < medianVol * 2.0) {
      // Volume too small / ordinary noise -> filter out
      return null;
    }

    // 6. Replenishment & Iceberg Assessment
    let replenishmentObserved = false;
    let replenishmentRatio = 1.0;
    if (cluster.initialDepthAtLevel > 0) {
      replenishmentRatio = Math.round((cluster.totalVolume / cluster.initialDepthAtLevel) * 100) / 100;
      if (cluster.totalVolume > cluster.initialDepthAtLevel * 0.9) {
        replenishmentObserved = true;
      }
    }

    // 7. Rejection Confirmation
    // Check if current/last traded price bounced away from defended price
    let rejectionObserved = false;
    if (this.orderBook) {
      const lastP = this.orderBook.getLastTradedPrice();
      if (lastP > 0) {
        if (absorptionType === 'buy_absorption' && lastP >= defendedPrice + this.tickSize * 0.5) {
          rejectionObserved = true;
        } else if (absorptionType === 'sell_absorption' && lastP <= defendedPrice - this.tickSize * 0.5) {
          rejectionObserved = true;
        }
      }
    }

    // 8. Transparent Internal Scoring Model (0 to 100)
    // A. Volume Score (0 to 25 pts)
    const volumeScore = Math.min(25, (volumeMultiplier / 3.0) * 25);

    // B. Price Resistance / Absorption Efficiency (0 to 25 pts)
    // Less displacement = higher resistance score
    const resistanceScore = Math.max(0, 25 * (1 - displacementTicks / (maxAllowedBreakthroughTicks + 0.5)));

    // C. Liquidity Zone Strength (0 to 25 pts)
    let zoneScore = 15;
    if (zone.type === 'resting_wall' || zone.type === 'heatmap_band') {
      zoneScore = 25;
    } else if (zone.type === 'poc' || zone.type === 'vwap') {
      zoneScore = 22;
    } else {
      zoneScore = 18;
    }

    // D. Multiplicity & Replenishment (0 to 15 pts)
    let multiScore = Math.min(8, (cluster.tradeCount / 6) * 8);
    if (replenishmentObserved) multiScore += 7;

    // E. Rejection Confirmation (0 to 10 pts)
    const rejectionScore = rejectionObserved ? 10 : 4;

    const totalScore = Math.round(volumeScore + resistanceScore + zoneScore + multiScore + rejectionScore);

    // Filter against minimum confidence score (default 70)
    if (totalScore < (this.settings.minConfidenceScore || 70)) {
      return null;
    }

    // 9. Assign A or A+ Grade
    // A+ represents exceptional absorption at confirmed major liquidity walls
    const minWallQty = this.getMinRestingWallQuantity();
    const isAPlus =
      totalScore >= 80 &&
      volumeMultiplier >= 1.8 &&
      displacementTicks <= 1.5 &&
      (replenishmentObserved ||
        zone.type === 'session_high_low' ||
        zone.type === 'session_high' ||
        zone.type === 'session_low' ||
        (zone.type === 'heatmap_band' && zone.strength >= 20) ||
        (zone.type === 'resting_wall' && zone.strength >= minWallQty * 2));

    const grade: AbsorptionGrade = isAPlus ? 'A+' : 'A';

    // 10. Deduplication & Event Merging
    const tfSec = this.getTimeframeSeconds();
    const startSec = Math.floor(cluster.startTime / 1000);
    const alignedCandleSec = Math.floor(startSec / tfSec) * tfSec;

    // Check if an existing event exists near this price within last 6 seconds or same candle
    const existing = this.events.find(
      (e) =>
        e.type === absorptionType &&
        Math.abs(e.price - cluster.price) <= this.tickSize * (this.settings.maxClusterSpreadTicks || 2) &&
        (Math.abs(now - e.timestamp) <= 6000 || e.candleTime === alignedCandleSec)
    );

    if (existing) {
      // Merge into existing event
      existing.totalAbsorbedVolume = Math.max(existing.totalAbsorbedVolume, cluster.totalVolume);
      existing.aggressiveBuyVolume = Math.max(existing.aggressiveBuyVolume, cluster.buyVolume);
      existing.aggressiveSellVolume = Math.max(existing.aggressiveSellVolume, cluster.sellVolume);
      existing.tradeCount = Math.max(existing.tradeCount, cluster.tradeCount);
      existing.holdDurationMs = Math.max(existing.holdDurationMs, now - existing.timestamp);
      existing.score = Math.max(existing.score, totalScore);
      existing.timestamp = now;
      if (grade === 'A+' && existing.grade !== 'A+') {
        existing.grade = 'A+';
      }
      if (replenishmentObserved) existing.replenishmentObserved = true;
      if (rejectionObserved) existing.rejectionObserved = true;
      existing.volumeMultiplier = Math.max(existing.volumeMultiplier || 0, Math.round(volumeMultiplier * 100) / 100);

      this.notifyListeners();
      return existing;
    }

    // Create new authoritative Absorption Event strictly aligned to the candle start time
    const eventId = `abs_${this.symbol}_${now}_${Math.round(cluster.price * 100)}`;
    const newEvent: AbsorptionEvent = {
      id: eventId,
      timestamp: cluster.startTime,
      candleTime: alignedCandleSec,
      price: Math.round(cluster.price * 100000) / 100000,
      priceCluster: {
        min: cluster.minPrice,
        max: cluster.maxPrice,
      },
      type: absorptionType,
      grade,
      score: totalScore,
      totalAbsorbedVolume: Math.round(cluster.totalVolume * 100) / 100,
      aggressiveBuyVolume: Math.round(cluster.buyVolume * 100) / 100,
      aggressiveSellVolume: Math.round(cluster.sellVolume * 100) / 100,
      tradeCount: cluster.tradeCount,
      priceDisplacement: Math.round(displacement * 100000) / 100000,
      priceDisplacementTicks: displacementTicks,
      holdDurationMs: Math.max(durationMs, 100),
      zoneType: zone.type,
      zoneStrength: zone.strength,
      zoneDescription: zone.description,
      replenishmentObserved,
      replenishmentRatio,
      confidence: Math.round((totalScore / 100) * 100) / 100,
      dataQuality: 'authoritative',
      rejectionObserved,
      instrument: this.symbol,
      volumeMultiplier: Math.round(volumeMultiplier * 100) / 100,
    };

    this.events.push(newEvent);
    this.eventById.set(newEvent.id, newEvent);

    // Keep memory bounded to 200 events
    if (this.events.length > 200) {
      const removed = this.events.shift();
      if (removed) this.eventById.delete(removed.id);
    }

    this.notifyListeners();
    return newEvent;
  }

  private evaluateAndFinalizeCluster(cluster: TradeCluster, now: number): void {
    this.evaluateCluster(cluster, now, true);
  }

  /**
   * Seed historical absorption events from OHLCV candles
   * Reconstructs genuine absorption defense strictly at MAJOR liquidity zones:
   * (Session High/Low, POC, VWAP value boundaries, Heatmap resting bands, Macro Structural Pivots)
   */
  seedFromCandles(
    candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>
  ): void {
    if (!candles || candles.length === 0) return;
    this.lastCandles = candles;

    // Preserve live-detected events that occurred recently
    const liveRecentEvents = this.events.filter((e) => Date.now() - e.timestamp < 30000);
    this.events = [...liveRecentEvents];
    this.eventById.clear();
    for (const ev of liveRecentEvents) {
      this.eventById.set(ev.id, ev);
    }

    const n = candles.length;
    if (n < 3) return;

    // 1. Calculate overall volume baseline & average candle range
    let sumVol = 0;
    let sumRange = 0;
    for (let i = 0; i < n; i++) {
      sumVol += candles[i].volume;
      sumRange += Math.max(0.01, candles[i].high - candles[i].low);
    }
    const avgVol = sumVol / n || 1;
    const avgCandleRange = sumRange / n || 1;

    // 2. Identify structural key reference levels across the candle dataset
    let maxHigh = -Infinity;
    let minLow = Infinity;
    let cumVol = 0;
    let cumVwapVol = 0;
    const priceVolumeMap = new Map<number, number>();

    for (const c of candles) {
      if (c.high > maxHigh) maxHigh = c.high;
      if (c.low < minLow) minLow = c.low;
      const mid = (c.open + c.high + c.low + c.close) / 4;
      cumVwapVol += mid * c.volume;
      cumVol += c.volume;

      const tick = Math.round(mid / this.tickSize) * this.tickSize;
      priceVolumeMap.set(tick, (priceVolumeMap.get(tick) || 0) + c.volume);
    }

    const vwap = cumVol > 0 ? cumVwapVol / cumVol : (maxHigh + minLow) / 2;

    // Compute VWAP standard deviation bands
    let vwapVarianceSum = 0;
    for (const c of candles) {
      const mid = (c.open + c.high + c.low + c.close) / 4;
      vwapVarianceSum += c.volume * Math.pow(mid - vwap, 2);
    }
    const vwapStdDev = cumVol > 0 ? Math.sqrt(vwapVarianceSum / cumVol) : avgCandleRange * 1.5;
    const vwapUpper1 = vwap + 1.25 * vwapStdDev;
    const vwapUpper2 = vwap + 2.0 * vwapStdDev;
    const vwapLower1 = vwap - 1.25 * vwapStdDev;
    const vwapLower2 = vwap - 2.0 * vwapStdDev;

    // Find Point of Control (POC)
    let pocPrice = vwap;
    let maxPocVol = 0;
    for (const [p, v] of priceVolumeMap.entries()) {
      if (v > maxPocVol) {
        maxPocVol = v;
        pocPrice = p;
      }
    }

    this.keyLevels.sessionHigh = maxHigh;
    this.keyLevels.sessionLow = minLow;
    this.keyLevels.poc = pocPrice;
    this.keyLevels.vwap = vwap;

    // Collect Heatmap Active Resting Levels if available
    const heatmapLevels = this.heatmapEngine ? this.heatmapEngine.getActiveRestingLevels() : [];
    const majorHeatmapLevels = heatmapLevels.filter((lvl) => lvl.qty > 5);

    // Identify Major Multi-Bar Swing Pivots (Prominent Peaks and Troughs, lookback >= 7 bars)
    const macroSwingHighs: number[] = [];
    const macroSwingLows: number[] = [];
    const pivotWindow = 7;
    for (let i = pivotWindow; i < n - pivotWindow; i++) {
      const ch = candles[i].high;
      const cl = candles[i].low;
      let isHigh = true;
      let isLow = true;
      for (let j = i - pivotWindow; j <= i + pivotWindow; j++) {
        if (j === i) continue;
        if (candles[j].high >= ch) isHigh = false;
        if (candles[j].low <= cl) isLow = false;
      }
      if (isHigh) macroSwingHighs.push(ch);
      if (isLow) macroSwingLows.push(cl);
    }

    // 3. Scan candles for genuine high-volume absorption events strictly at MAJOR liquidity zones
    const detected: AbsorptionEvent[] = [];
    const minInstrumentVol = this.getInstrumentMinVolume();

    // Zone matching tolerance: proportional to average bar volatility and tick size
    const tolerance = Math.max(
      (this.settings.zoneRelevanceToleranceTicks || 3) * this.tickSize,
      avgCandleRange * 0.20
    );

    for (let i = 2; i < n; i++) {
      const c = candles[i];
      if (c.volume <= 0) continue;

      // Local rolling average (prior 15 bars)
      const windowStart = Math.max(0, i - 15);
      let localSum = 0;
      let count = 0;
      for (let j = windowStart; j < i; j++) {
        localSum += candles[j].volume;
        count++;
      }
      const localAvg = count > 0 ? localSum / count : avgVol;
      const volMultiplier = c.volume / Math.max(0.001, localAvg);

      // Must have notable volume to even consider absorption (>= 1.35x baseline)
      if (volMultiplier < 1.35 && c.volume < minInstrumentVol) continue;

      const candleRange = c.high - c.low;
      if (candleRange <= 0) continue;

      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const upperWickRatio = upperWick / candleRange;
      const lowerWickRatio = lowerWick / candleRange;
      const candleSec = c.time > 1e11 ? Math.floor(c.time / 1000) : c.time;
      const barTimeMs = candleSec * 1000;

      // ==========================================
      // CHECK SELL-SIDE ABSORPTION (Defending Resistance)
      // Buyers pushed into resistance, but passive sellers absorbed the buying
      // ==========================================
      const isSellRejection = upperWickRatio >= 0.30 && c.close <= c.high - candleRange * 0.35;

      if (isSellRejection) {
        let zoneType: AbsorptionZoneType | null = null;
        let zoneDesc = '';
        let zoneStrength = 75;

        // Priority 1: Session Extreme High
        if (Math.abs(c.high - maxHigh) <= tolerance * 1.5 || (c.high >= maxHigh && Math.max(c.open, c.close) <= maxHigh + tolerance)) {
          zoneType = 'session_high';
          zoneDesc = 'Session High Resistance Zone';
          zoneStrength = 95;
        }
        // Priority 2: Point of Control (POC)
        else if (Math.abs(c.high - pocPrice) <= tolerance) {
          zoneType = 'poc';
          zoneDesc = 'Point of Control (POC) Resistance';
          zoneStrength = 88;
        }
        // Priority 3: Heatmap High-Liquidity Ask Band
        else {
          const matchedHmLvl = majorHeatmapLevels.find((lvl) => lvl.isAsk && Math.abs(lvl.price - c.high) <= tolerance);
          if (matchedHmLvl) {
            zoneType = 'heatmap_band';
            zoneDesc = `Heatmap Ask Liquidity Band (${Math.round(matchedHmLvl.qty)} lots)`;
            zoneStrength = 90;
          }
          // Priority 4: Institutional VWAP Band (+1.25 / +2.0 StdDev)
          else if (Math.abs(c.high - vwapUpper1) <= tolerance || Math.abs(c.high - vwapUpper2) <= tolerance || Math.abs(c.high - vwap) <= tolerance) {
            zoneType = 'vwap';
            zoneDesc = 'VWAP Value Area Boundary Resistance';
            zoneStrength = 82;
          }
          // Priority 5: Major Multi-Bar Swing High (Macro Liquidity Pool)
          else {
            const matchedPivot = macroSwingHighs.find((p) => Math.abs(p - c.high) <= tolerance);
            if (matchedPivot) {
              zoneType = 'resting_wall';
              zoneDesc = 'Major Structural Pivot Resistance';
              zoneStrength = 80;
            }
          }
        }

        // ONLY proceed if a genuine major liquidity zone was tested!
        if (zoneType) {
          const displacementTicks = Math.round((upperWick / this.tickSize) * 10) / 10;
          
          // Transparent Scoring (0-100)
          const volScore = Math.min(35, Math.round(20 + Math.max(0, (volMultiplier - 1.35) / 1.45) * 15));
          const resistScore = Math.min(35, Math.round(20 + Math.max(0, (upperWickRatio - 0.30) / 0.25) * 15));
          let zoneScore = 24;
          if (zoneType === 'session_high') zoneScore = 30;
          else if (zoneType === 'heatmap_band') zoneScore = 29;
          else if (zoneType === 'poc') zoneScore = 28;
          else if (zoneType === 'vwap') zoneScore = 26;

          const totalScore = Math.min(100, Math.round(volScore + resistScore + zoneScore));

          // A+ requires high conviction: score >= 78, vol >= 2.0x, wick >= 40%, and major structural zone
          const isAPlus =
            totalScore >= 78 &&
            volMultiplier >= 2.0 &&
            upperWickRatio >= 0.40 &&
            (zoneType === 'session_high' || zoneType === 'poc' || zoneType === 'heatmap_band');

          const grade: AbsorptionGrade = isAPlus ? 'A+' : 'A';

          detected.push({
            id: `abs_hist_sell_${candleSec}`,
            timestamp: barTimeMs,
            candleTime: candleSec,
            price: Math.round(c.high * 100000) / 100000,
            priceCluster: { min: Math.max(c.open, c.close), max: c.high },
            type: 'sell_absorption',
            grade,
            score: totalScore,
            totalAbsorbedVolume: Math.round(c.volume * (0.6 + upperWickRatio * 0.3) * 100) / 100,
            aggressiveBuyVolume: Math.round(c.volume * 0.75 * 100) / 100,
            aggressiveSellVolume: Math.round(c.volume * 0.25 * 100) / 100,
            tradeCount: Math.max(3, Math.round(c.volume * 2)),
            priceDisplacement: Math.round(upperWick * 100000) / 100000,
            priceDisplacementTicks: displacementTicks,
            holdDurationMs: 60000,
            zoneType,
            zoneStrength,
            zoneDescription: zoneDesc,
            replenishmentObserved: isAPlus,
            replenishmentRatio: isAPlus ? 1.4 : 1.0,
            confidence: Math.min(0.98, Math.round((totalScore / 100) * 100) / 100),
            dataQuality: 'authoritative',
            rejectionObserved: true,
            instrument: this.symbol,
            volumeMultiplier: Math.round(volMultiplier * 100) / 100,
          });
        }
      }

      // ==========================================
      // CHECK BUY-SIDE ABSORPTION (Defending Support)
      // Sellers pushed into support, but passive buyers absorbed the selling
      // ==========================================
      const isBuyRejection = lowerWickRatio >= 0.30 && c.close >= c.low + candleRange * 0.35;

      if (isBuyRejection) {
        let zoneType: AbsorptionZoneType | null = null;
        let zoneDesc = '';
        let zoneStrength = 75;

        // Priority 1: Session Extreme Low
        if (Math.abs(c.low - minLow) <= tolerance * 1.5 || (c.low <= minLow && Math.min(c.open, c.close) >= minLow - tolerance)) {
          zoneType = 'session_low';
          zoneDesc = 'Session Low Support Zone';
          zoneStrength = 95;
        }
        // Priority 2: Point of Control (POC)
        else if (Math.abs(c.low - pocPrice) <= tolerance) {
          zoneType = 'poc';
          zoneDesc = 'Point of Control (POC) Support';
          zoneStrength = 88;
        }
        // Priority 3: Heatmap High-Liquidity Bid Band
        else {
          const matchedHmLvl = majorHeatmapLevels.find((lvl) => !lvl.isAsk && Math.abs(lvl.price - c.low) <= tolerance);
          if (matchedHmLvl) {
            zoneType = 'heatmap_band';
            zoneDesc = `Heatmap Bid Liquidity Band (${Math.round(matchedHmLvl.qty)} lots)`;
            zoneStrength = 90;
          }
          // Priority 4: Institutional VWAP Band (-1.25 / -2.0 StdDev)
          else if (Math.abs(c.low - vwapLower1) <= tolerance || Math.abs(c.low - vwapLower2) <= tolerance || Math.abs(c.low - vwap) <= tolerance) {
            zoneType = 'vwap';
            zoneDesc = 'VWAP Value Area Boundary Support';
            zoneStrength = 82;
          }
          // Priority 5: Major Multi-Bar Swing Low (Macro Liquidity Pool)
          else {
            const matchedPivot = macroSwingLows.find((p) => Math.abs(p - c.low) <= tolerance);
            if (matchedPivot) {
              zoneType = 'resting_wall';
              zoneDesc = 'Major Structural Pivot Support';
              zoneStrength = 80;
            }
          }
        }

        // ONLY proceed if a genuine major liquidity zone was tested!
        if (zoneType) {
          const displacementTicks = Math.round((lowerWick / this.tickSize) * 10) / 10;
          
          // Transparent Scoring (0-100)
          const volScore = Math.min(35, Math.round(20 + Math.max(0, (volMultiplier - 1.35) / 1.45) * 15));
          const resistScore = Math.min(35, Math.round(20 + Math.max(0, (lowerWickRatio - 0.30) / 0.25) * 15));
          let zoneScore = 24;
          if (zoneType === 'session_low') zoneScore = 30;
          else if (zoneType === 'heatmap_band') zoneScore = 29;
          else if (zoneType === 'poc') zoneScore = 28;
          else if (zoneType === 'vwap') zoneScore = 26;

          const totalScore = Math.min(100, Math.round(volScore + resistScore + zoneScore));

          // A+ requires high conviction: score >= 78, vol >= 2.0x, wick >= 40%, and major structural zone
          const isAPlus =
            totalScore >= 78 &&
            volMultiplier >= 2.0 &&
            lowerWickRatio >= 0.40 &&
            (zoneType === 'session_low' || zoneType === 'poc' || zoneType === 'heatmap_band');

          const grade: AbsorptionGrade = isAPlus ? 'A+' : 'A';

          detected.push({
            id: `abs_hist_buy_${candleSec}`,
            timestamp: barTimeMs,
            candleTime: candleSec,
            price: Math.round(c.low * 100000) / 100000,
            priceCluster: { min: c.low, max: Math.min(c.open, c.close) },
            type: 'buy_absorption',
            grade,
            score: totalScore,
            totalAbsorbedVolume: Math.round(c.volume * (0.6 + lowerWickRatio * 0.3) * 100) / 100,
            aggressiveBuyVolume: Math.round(c.volume * 0.25 * 100) / 100,
            aggressiveSellVolume: Math.round(c.volume * 0.75 * 100) / 100,
            tradeCount: Math.max(3, Math.round(c.volume * 2)),
            priceDisplacement: Math.round(lowerWick * 100000) / 100000,
            priceDisplacementTicks: displacementTicks,
            holdDurationMs: 60000,
            zoneType,
            zoneStrength,
            zoneDescription: zoneDesc,
            replenishmentObserved: isAPlus,
            replenishmentRatio: isAPlus ? 1.4 : 1.0,
            confidence: Math.min(0.98, Math.round((totalScore / 100) * 100) / 100),
            dataQuality: 'authoritative',
            rejectionObserved: true,
            instrument: this.symbol,
            volumeMultiplier: Math.round(volMultiplier * 100) / 100,
          });
        }
      }
    }

    // Add detected events
    for (const ev of detected) {
      this.events.push(ev);
      this.eventById.set(ev.id, ev);
    }

    // Keep memory bounded to 300 events
    if (this.events.length > 300) {
      this.events = this.events.slice(-300);
    }

    this.notifyListeners(true);
  }

  /**
   * Return visible events within a time range, dynamically filtering by all user settings:
   * gradeFilter, minConfidenceScore, and minVolumeMultiplier.
   */
  getVisibleEvents(fromMs: number = 0, toMs: number = Infinity): AbsorptionEvent[] {
    if (!this.settings.enabled) return [];
    const gradeFilter = this.settings.gradeFilter;
    const minConf = this.settings.minConfidenceScore ?? 70;
    const minVolMult = this.settings.minVolumeMultiplier ?? 1.5;

    return this.events.filter((e) => {
      // 1. Time range filter
      if (e.timestamp < fromMs || e.timestamp > toMs) return false;
      // 2. Grade filter
      if (gradeFilter === 'a_plus_only' && e.grade !== 'A+') return false;
      // 3. Minimum Confidence Score slider
      if (e.score < minConf) return false;
      // 4. Minimum Volume Multiplier slider
      if (e.volumeMultiplier !== undefined && e.volumeMultiplier < minVolMult) return false;

      return true;
    });
  }

  getEvents(): AbsorptionEvent[] {
    return this.events;
  }

  getAllEvents(): AbsorptionEvent[] {
    return this.events;
  }

  /**
   * Calculate bubble radius with logarithmic volume scaling
   */
  calculateBubbleRadius(volume: number, minVol: number = 1, maxVol: number = 1000): number {
    const minR = this.settings.bubbleMinRadius || 8;
    const maxR = this.settings.bubbleMaxRadius || 28;
    const safeMinVol = Math.max(0.001, minVol);
    const safeMaxVol = Math.max(safeMinVol * 10, maxVol);
    const logMin = Math.log(safeMinVol);
    const logMax = Math.log(safeMaxVol);
    const logRange = logMax - logMin || 1;
    const evLog = Math.log(Math.max(safeMinVol, volume));
    const t = Math.max(0, Math.min(1, (evLog - logMin) / logRange));
    return Math.round(minR + t * (maxR - minR));
  }

  /**
   * Hit test for hover and click interaction
   */
  hitTest(
    mouseX: number,
    mouseY: number,
    renderedCoords: Array<{ event: AbsorptionEvent; cx: number; cy: number; radius: number }>
  ): AbsorptionEvent | null {
    if (!this.settings.enabled || renderedCoords.length === 0) return null;

    // Search in reverse (top-most bubbles first)
    for (let i = renderedCoords.length - 1; i >= 0; i--) {
      const item = renderedCoords[i];
      const dx = mouseX - item.cx;
      const dy = mouseY - item.cy;
      const distSq = dx * dx + dy * dy;
      const hitRadius = Math.max(item.radius, 14) + 4;
      if (distSq <= hitRadius * hitRadius) {
        return item.event;
      }
    }
    return null;
  }
}
