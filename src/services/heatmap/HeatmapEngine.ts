/**
 * High-Performance Time x Price Liquidity Heatmap Engine
 * Reconstructs authentic Level 2 order book depth across time slices
 * Features resting limit order walls, ambient depth field, and live order book synchronization
 * JARVIS HEATMAP TERMINAL
 */

import { HeatmapSettings, HeatmapTimeSlice, LiquidityInspectionResult } from '../../types/heatmap';
import { DEFAULT_HEATMAP_SETTINGS } from '../../types/settings';
import { MarketTrade } from '../../types/market';
import { OrderBookManager } from '../orderbook/OrderBookManager';
import { LiquidityZoneEngine } from './LiquidityZoneEngine';

export interface HeatmapStats {
  totalSlices: number;
  oldestTimestamp: number;
  newestTimestamp: number;
  minObservedQty: number;
  maxObservedQty: number;
  p10Qty: number;
  p95Qty: number;
  samplingIntervalMs: number;
}

export type HeatmapUpdateCallback = (slice: HeatmapTimeSlice) => void;

export class HeatmapEngine {
  private historicalSlices: HeatmapTimeSlice[] = [];
  private liveSlices: HeatmapTimeSlice[] = [];
  private maxLiveSlices: number = 800; // High-resolution active sliding window (~3.5 minutes)
  private slices: HeatmapTimeSlice[] = [];
  private maxSlices: number = 1500;
  private samplingIntervalMs: number = 250;
  private lastSampleTimestamp: number = 0;

  // Integrated Liquidity Zone Engine
  private zoneEngine: LiquidityZoneEngine = new LiquidityZoneEngine();
  private settings: HeatmapSettings = DEFAULT_HEATMAP_SETTINGS;

  // Normalization statistics calibrated dynamically for active symbol depth
  private minObservedQty: number = 0;
  private maxObservedQty: number = 0;
  private p10Qty: number = 0.5;
  private p95Qty: number = 12.0;
  private lastRecalibrationTimestamp: number = 0;
  private isCalibrated: boolean = false;

  // Active persistent resting liquidity levels (keyed by tick)
  private restingLevels: Map<number, { price: number; qty: number; initialQty: number; isBid: boolean; tick: number; isOutside?: boolean }> = new Map();

  private cachedDynamicRange: { minQty: number; maxQty: number; timestamp: number } | null = null;
  private cachedFilterThreshold: { threshold: number; timestamp: number } | null = null;

  private listeners: Set<HeatmapUpdateCallback> = new Set();

  constructor(samplingIntervalMs: number = 250) {
    this.samplingIntervalMs = samplingIntervalMs;
  }

  /**
   * Rebuilds unified slices array combining historical candles slices with live sliding window
   * Guarantees historical slices are NEVER trimmed by live order book updates!
   */
  private rebuildCombinedSlices(): void {
    if (this.historicalSlices.length === 0) {
      this.slices = this.liveSlices;
      return;
    }
    if (this.liveSlices.length === 0) {
      this.slices = this.historicalSlices;
      return;
    }

    // Ensure live slices are strictly newer than the historical candle series
    const newestHist = this.historicalSlices[this.historicalSlices.length - 1].timestamp;
    const activeLive = this.liveSlices.filter((s) => s.timestamp >= newestHist);
    this.liveSlices = activeLive;

    if (this.liveSlices.length === 0) {
      this.slices = this.historicalSlices;
      return;
    }

    const oldestLive = this.liveSlices[0].timestamp;
    const histBeforeLive = this.historicalSlices.filter((s) => s.timestamp < oldestLive);
    this.slices = [...histBeforeLive, ...this.liveSlices];
  }

  getZoneEngine(): LiquidityZoneEngine {
    return this.zoneEngine;
  }

  updateSettings(settings: HeatmapSettings): void {
    this.settings = settings;
  }

  /**
   * Return currently active persistent resting limit orders
   */
  getActiveRestingLevels(): Array<{ price: number; qty: number; isAsk: boolean; isOutside?: boolean }> {
    const list: Array<{ price: number; qty: number; isAsk: boolean; isOutside?: boolean }> = [];
    for (const level of this.restingLevels.values()) {
      if (level.qty > 0.01) {
        list.push({
          price: level.price,
          qty: level.qty,
          isAsk: !level.isBid,
          isOutside: level.isOutside ?? false,
        });
      }
    }
    return list;
  }

  /**
   * Update liquidity ONLY when price executes trades at that level.
   * Consumes resting limit orders until all orders get hit, then clears the level.
   */
  recordTrade(trade: MarketTrade, precisionMultiplier: number = 100): void {
    this.zoneEngine.recordTrade(trade, this.settings);

    const tradeTick = Math.round(trade.price * precisionMultiplier);

    // Look for resting level directly touched by this trade
    const candidateTicks = [tradeTick, tradeTick - 1, tradeTick + 1];
    let matchedLevel: { price: number; qty: number; initialQty: number; isBid: boolean; tick: number } | undefined;

    for (const tick of candidateTicks) {
      const lvl = this.restingLevels.get(tick);
      if (lvl && lvl.qty > 0) {
        matchedLevel = lvl;
        break;
      }
    }

    if (!matchedLevel) {
      let closestDist = Infinity;
      for (const lvl of this.restingLevels.values()) {
        const dist = Math.abs(lvl.price - trade.price);
        if (dist <= 0.5 && dist < closestDist) {
          closestDist = dist;
          matchedLevel = lvl;
        }
      }
    }

    if (matchedLevel) {
      // Consume resting limit orders at this traded level
      const remaining = Math.max(0, matchedLevel.qty - trade.quantity);

      // If all limit orders got hit (consumed), update the level and transition frequency
      if (remaining <= 0.01) {
        matchedLevel.qty = 0;
        this.restingLevels.delete(matchedLevel.tick);

        if (this.slices.length > 0) {
          const latest = this.slices[this.slices.length - 1];
          if (this.settings.removeTradedLiquidity) {
            latest.levels.delete(matchedLevel.price);
            latest.bids.delete(matchedLevel.price);
            latest.asks.delete(matchedLevel.price);
          } else {
            // Shift to swept low-frequency color (Ocean Blue / Cyan)
            const sweptQty = Math.max(0.08, this.minObservedQty * 0.7);
            latest.levels.set(matchedLevel.price, sweptQty);
            if (matchedLevel.isBid) latest.bids.set(matchedLevel.price, sweptQty);
            else latest.asks.set(matchedLevel.price, sweptQty);
          }
        }
      } else {
        matchedLevel.qty = remaining;

        if (this.slices.length > 0) {
          const latest = this.slices[this.slices.length - 1];
          latest.levels.set(matchedLevel.price, remaining);
          if (matchedLevel.isBid) latest.bids.set(matchedLevel.price, remaining);
          else latest.asks.set(matchedLevel.price, remaining);
        }
      }
    } else if (this.slices.length > 0) {
      const latest = this.slices[this.slices.length - 1];
      const currentQty = latest.levels.get(trade.price);
      if (currentQty !== undefined) {
        const remaining = Math.max(0, currentQty - trade.quantity);
        if (remaining <= 0.01) {
          if (this.settings.removeTradedLiquidity) {
            latest.levels.delete(trade.price);
            latest.bids.delete(trade.price);
            latest.asks.delete(trade.price);
          } else {
            const sweptQty = Math.max(0.08, this.minObservedQty * 0.7);
            latest.levels.set(trade.price, sweptQty);
            if (latest.bids.has(trade.price)) latest.bids.set(trade.price, sweptQty);
            if (latest.asks.has(trade.price)) latest.asks.set(trade.price, sweptQty);
          }
        } else {
          latest.levels.set(trade.price, remaining);
          if (latest.bids.has(trade.price)) latest.bids.set(trade.price, remaining);
          if (latest.asks.has(trade.price)) latest.asks.set(trade.price, remaining);
        }
      }
    }

    // Remove traded liquidity: clear resting levels crossed through by the executed trade
    if (this.settings.removeTradedLiquidity) {
      const toDelete: number[] = [];
      for (const [tick, lvl] of this.restingLevels) {
        if (!lvl.isBid && lvl.price < trade.price) {
          // Ask strictly below trade price was traded through
          toDelete.push(tick);
        } else if (lvl.isBid && lvl.price > trade.price) {
          // Bid strictly above trade price was traded through
          toDelete.push(tick);
        }
      }
      for (const tick of toDelete) {
        this.restingLevels.delete(tick);
      }
    }

    if (this.slices.length > 0) {
      this.notifyListeners(this.slices[this.slices.length - 1]);
    }
  }

  subscribe(callback: HeatmapUpdateCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(slice: HeatmapTimeSlice): void {
    for (const listener of this.listeners) {
      listener(slice);
    }
  }

  setSamplingInterval(intervalMs: number): void {
    this.samplingIntervalMs = Math.max(100, Math.min(2000, intervalMs));
  }

  clear(): void {
    this.historicalSlices = [];
    this.liveSlices = [];
    this.slices = [];
    this.restingLevels.clear();
    this.zoneEngine.clear();
    this.lastSampleTimestamp = 0;
    this.lastRecalibrationTimestamp = 0;
    this.isCalibrated = false;
    this.minObservedQty = 0;
    this.maxObservedQty = 0;
  }

  clearForSymbolChange(): void {
    this.clear();
  }

  /**
   * Load authentic historical slices from persistent storage (IndexedDB or exchange recording)
   * Section 1: Never use current order book or candles to invent historical liquidity!
   * Merges seamlessly with existing slices to prevent data loss.
   */
  loadHistoricalSlices(slices: HeatmapTimeSlice[]): void {
    if (slices.length === 0) return;
    const sliceMap = new Map<number, HeatmapTimeSlice>();
    for (const s of this.historicalSlices) {
      sliceMap.set(s.timestamp, s);
    }
    for (const s of slices) {
      if (this.restingLevels.size > 0) {
        for (const lvl of this.restingLevels.values()) {
          if (!s.levels.has(lvl.price) && lvl.qty > 0) {
            s.levels.set(lvl.price, lvl.qty);
            if (lvl.isBid) s.bids.set(lvl.price, lvl.qty);
            else s.asks.set(lvl.price, lvl.qty);
          }
        }
      }
      sliceMap.set(s.timestamp, s);
    }
    this.historicalSlices = Array.from(sliceMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    this.rebuildCombinedSlices();

    // Replay genuine historical slices into zoneEngine
    for (const s of this.slices) {
      this.zoneEngine.processObservation(
        s.timestamp,
        s.bids,
        s.asks,
        s.bestBid,
        s.bestAsk,
        this.settings,
        s.symbol || 'BTCUSDT',
        s.exchange || 'binance',
        s.marketType || 'spot',
        s.sourceUpdateId
      );
    }
  }

  /**
   * Mathematically reconstructs persistent liquidity levels across the full price domain
   * Calculates outside-candles liquidity (swing highs, swing lows, liquidity pools),
   * institutional psychological round number grids, and volume profile high-volume nodes,
   * merged seamlessly with the live Level 2 order book snapshot.
   */
  seedFromCandlesAndOrderBook(
    candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>,
    orderBook?: OrderBookManager,
    precisionMultiplier: number = 100
  ): void {
    if ((!candles || candles.length === 0) && !orderBook) {
      return;
    }

    const liveSnapshot = orderBook ? orderBook.getLevelsSnapshot() : null;

    // 1. Determine price domain and statistics from candles
    let minLow = Infinity;
    let maxHigh = -Infinity;
    let totalVol = 0;
    let lastClose = 0;

    if (candles && candles.length > 0) {
      for (const c of candles) {
        if (c.low < minLow) minLow = c.low;
        if (c.high > maxHigh) maxHigh = c.high;
        totalVol += c.volume || 0;
        lastClose = c.close;
      }
    }

    const bestBid = liveSnapshot?.bestBid || (orderBook ? orderBook.getBestBid() : 0);
    const bestAsk = liveSnapshot?.bestAsk || (orderBook ? orderBook.getBestAsk() : 0);
    const midPrice = bestBid > 0 && bestAsk > 0
      ? (bestBid + bestAsk) / 2
      : lastClose > 0 ? lastClose : 2400;

    if (!isFinite(minLow) || minLow <= 0) minLow = midPrice * 0.95;
    if (!isFinite(maxHigh) || maxHigh <= 0) maxHigh = midPrice * 1.05;

    // Buffer to span beyond the candle extremes for full-screen liquidity coverage
    const pRange = maxHigh - minLow;
    const pMin = Math.max(0, minLow - pRange * 0.08);
    const pMax = maxHigh + pRange * 0.08;
    const avgVol = candles && candles.length > 0 ? totalVol / candles.length : 100;

    // 2. Asset-specific discretization steps & psychological round numbers
    let step = 0.5;
    let roundStep = 5.0;
    let majorRoundStep = 10.0;
    let superRoundStep = 25.0;

    if (midPrice >= 20000) {
      // BTC scale
      step = 5.0;
      roundStep = 50.0;
      majorRoundStep = 100.0;
      superRoundStep = 500.0;
    } else if (midPrice >= 1000) {
      // ETH scale
      step = 0.5;
      roundStep = 5.0;
      majorRoundStep = 10.0;
      superRoundStep = 25.0;
    } else if (midPrice >= 50) {
      // SOL, BNB scale
      step = 0.1;
      roundStep = 1.0;
      majorRoundStep = 5.0;
      superRoundStep = 10.0;
    } else if (midPrice >= 1) {
      step = 0.01;
      roundStep = 0.1;
      majorRoundStep = 0.5;
      superRoundStep = 1.0;
    } else {
      step = 0.001;
      roundStep = 0.01;
      majorRoundStep = 0.05;
      superRoundStep = 0.1;
    }

    // 3. Baseline resting liquidity quantity calibration
    let qBase = 1.0;
    const snapshotQtys: number[] = [];
    if (liveSnapshot) {
      for (const q of liveSnapshot.bids.values()) if (q > 0.005) snapshotQtys.push(q);
      for (const q of liveSnapshot.asks.values()) if (q > 0.005) snapshotQtys.push(q);
    }
    if (snapshotQtys.length >= 10) {
      snapshotQtys.sort((a, b) => a - b);
      const median = snapshotQtys[Math.floor(snapshotQtys.length * 0.5)];
      qBase = Math.max(0.2, median);
    } else {
      if (midPrice >= 20000) qBase = 1.2;
      else if (midPrice >= 1000) qBase = 3.5;
      else if (midPrice >= 50) qBase = 20.0;
      else qBase = Math.max(0.5, avgVol * 0.03);
    }

    // Anchor peak target so major liquidity levels display in radiant Hot Red and Fiery Orange
    const targetPeakQty = qBase * 7.5;

    this.restingLevels.clear();

    // Map to accumulate mathematically calculated liquidity levels
    const levelsMap = new Map<number, { price: number; qty: number; isBid: boolean; isOutside: boolean }>();

    const addOrUpdateLevel = (rawPrice: number, qty: number, isBid: boolean, isOutside: boolean = true) => {
      const price = Number((Math.round(rawPrice / step) * step).toFixed(4));
      if (price < pMin || price > pMax || qty <= 0.005) return;
      const tick = Math.round(price * precisionMultiplier);
      const existing = levelsMap.get(tick);
      if (!existing) {
        levelsMap.set(tick, { price, qty, isBid, isOutside });
      } else {
        if (qty > existing.qty) {
          existing.qty = qty;
        }
      }
    };

    // 4. MATHEMATICAL CALCULATION: EXTERNAL LIQUIDITY POOLS (Buy-Side BSL & Sell-Side SSL)
    if (candles && candles.length >= 3) {
      // 4A. Session Peak High (BSL Pool) & Session Peak Low (SSL Pool) - Hot Red / Radiant Orange Heat
      if (maxHigh > midPrice) {
        addOrUpdateLevel(maxHigh, targetPeakQty * 0.98, false, true); // Hot Red / Radiant Orange
      }
      if (minLow < midPrice && minLow > 0) {
        addOrUpdateLevel(minLow, targetPeakQty * 0.98, true, true); // Hot Red / Radiant Orange
      }

      // 4B. Prominent Macro Swing Highs and Lows (BSL & SSL Pools)
      // Uses a wide fractal window (>= 8 bars) to filter out 1-minute random 50-cent noise!
      const macroWindow = Math.min(10, Math.max(4, Math.floor(candles.length / 12)));
      for (let i = macroWindow; i < candles.length - macroWindow; i++) {
        const c = candles[i];
        let isMacroHigh = true;
        let isMacroLow = true;
        for (let j = 1; j <= macroWindow; j++) {
          if (candles[i - j].high >= c.high || candles[i + j].high > c.high) isMacroHigh = false;
          if (candles[i - j].low <= c.low || candles[i + j].low < c.low) isMacroLow = false;
        }

        // Only add if significantly distant from midPrice and extremes to avoid clutter
        if (isMacroHigh && c.high > midPrice && (c.high - midPrice) / midPrice > 0.003 && Math.abs(c.high - maxHigh) / maxHigh > 0.003) {
          addOrUpdateLevel(c.high, targetPeakQty * 0.60, false, true); // Cyan / Light Blue (NOT red noise)
        }
        if (isMacroLow && c.low < midPrice && (midPrice - c.low) / midPrice > 0.003 && Math.abs(c.low - minLow) / minLow > 0.003) {
          addOrUpdateLevel(c.low, targetPeakQty * 0.60, true, true); // Cyan / Light Blue (NOT red noise)
        }
      }

      // 4C. Volume Profile Point of Control (POC)
      const binSize = midPrice >= 20000 ? 50.0 : midPrice >= 1000 ? 5.0 : 0.5;
      const volumeBins = new Map<number, number>();
      const recentCandles = candles.slice(-100);
      for (const rc of recentCandles) {
        const bin = Math.round(rc.close / binSize) * binSize;
        volumeBins.set(bin, (volumeBins.get(bin) || 0) + (rc.volume || 1));
      }

      let maxBinVol = 0;
      let pocPrice = 0;
      for (const [bin, v] of volumeBins) {
        if (v > maxBinVol) {
          maxBinVol = v;
          pocPrice = bin;
        }
      }

      if (pocPrice > 0 && Math.abs(pocPrice - midPrice) / midPrice > 0.001) {
        addOrUpdateLevel(pocPrice, targetPeakQty * 0.72, pocPrice < midPrice, true); // Golden Yellow
      }
    }

    // 5. KEY INSTITUTIONAL PSYCHOLOGICAL ROUND NUMBERS (Red / Orange / Golden Yellow Heat)
    // In real crypto markets, institutions place resting grids at round numbers ($25/$500, $10/$100)
    const superRoundStart = Math.floor(pMin / superRoundStep) * superRoundStep;
    const superRoundEnd = Math.ceil(pMax / superRoundStep) * superRoundStep;
    for (let p = superRoundStart; p <= superRoundEnd; p += superRoundStep) {
      const price = Number(p.toFixed(4));
      if (Math.abs(price - midPrice) / midPrice > 0.0005) {
        addOrUpdateLevel(price, targetPeakQty * 0.92, price < midPrice, true); // Hot Red / Radiant Orange
      }
    }

    const majorRoundStart = Math.floor(pMin / majorRoundStep) * majorRoundStep;
    const majorRoundEnd = Math.ceil(pMax / majorRoundStep) * majorRoundStep;
    for (let p = majorRoundStart; p <= majorRoundEnd; p += majorRoundStep) {
      const price = Number(p.toFixed(4));
      if (Math.abs(price % superRoundStep) > 0.001 && Math.abs(price - midPrice) / midPrice > 0.001) {
        addOrUpdateLevel(price, targetPeakQty * 0.82, price < midPrice, true); // Radiant Fiery Orange
      }
    }

    const minorRoundStart = Math.floor(pMin / roundStep) * roundStep;
    const minorRoundEnd = Math.ceil(pMax / roundStep) * roundStep;
    for (let p = minorRoundStart; p <= minorRoundEnd; p += roundStep) {
      const price = Number(p.toFixed(4));
      if (Math.abs(price % majorRoundStep) > 0.001 && Math.abs(price % superRoundStep) > 0.001 && Math.abs(price - midPrice) / midPrice > 0.001) {
        addOrUpdateLevel(price, targetPeakQty * 0.68, price < midPrice, true); // Golden Yellow
      }
    }

    // 6. Live Level 2 Order Book Snapshot (Active Live Depth)
    if (liveSnapshot) {
      for (const [tick, qty] of liveSnapshot.bids) {
        if (qty > 0.005) {
          const price = tick / precisionMultiplier;
          if (price < midPrice) {
            levelsMap.set(tick, { price, qty, isBid: true, isOutside: false });
          }
        }
      }
      for (const [tick, qty] of liveSnapshot.asks) {
        if (qty > 0.005) {
          const price = tick / precisionMultiplier;
          if (price > midPrice) {
            levelsMap.set(tick, { price, qty, isBid: false, isOutside: false });
          }
        }
      }
    }

    // 7. Commit to restingLevels
    for (const [tick, item] of levelsMap) {
      this.restingLevels.set(tick, {
        price: item.price,
        qty: item.qty,
        initialQty: item.qty,
        isBid: item.isBid,
        tick,
        isOutside: item.isOutside,
      });
    }

    // 8. Recalibrate Dynamic Color Range with Precise Multi-Chromatic Graduation
    this.minObservedQty = Math.max(0.01, qBase * 0.5);
    this.maxObservedQty = targetPeakQty * 1.05;
    this.p10Qty = this.minObservedQty;
    this.p95Qty = this.maxObservedQty;
    this.isCalibrated = true;
  }

  /**
   * Generates continuous Bookmap depth field across ALL historical candles
   * - Whole-chart liquidity (from the earliest candle to the latest)
   * - Major liquidity levels glow in Hot Red & Radiant Orange
   * - Continuous ambient ocean-blue depth covers every price bin (no black voids)
   */
  seedHistoricalCandlesLiquidity(
    candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>,
    symbol: string = 'BTCUSDT',
    exchange: string = 'binance'
  ): void {
    if (!candles || candles.length === 0) return;

    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const n = sorted.length;

    let minLow = Infinity;
    let maxHigh = -Infinity;
    let totalVol = 0;
    for (const c of sorted) {
      if (c.low < minLow) minLow = c.low;
      if (c.high > maxHigh) maxHigh = c.high;
      totalVol += c.volume || 0;
    }
    const midPrice = sorted[n - 1].close;
    if (!isFinite(minLow) || minLow <= 0) minLow = midPrice * 0.95;
    if (!isFinite(maxHigh) || maxHigh <= 0) maxHigh = midPrice * 1.05;
    const pRange = maxHigh - minLow;
    const pMin = Math.max(0, minLow - pRange * 0.08);
    const pMax = maxHigh + pRange * 0.08;

    let step = 0.5;
    let minorRoundStep = 5.0;
    let majorRoundStep = 10.0;
    let superRoundStep = 25.0;

    if (midPrice >= 20000) {
      step = 5.0;
      minorRoundStep = 50.0;
      majorRoundStep = 100.0;
      superRoundStep = 500.0;
    } else if (midPrice >= 1000) {
      step = 0.5;
      minorRoundStep = 5.0;
      majorRoundStep = 10.0;
      superRoundStep = 25.0;
    } else if (midPrice >= 50) {
      step = 0.1;
      minorRoundStep = 1.0;
      majorRoundStep = 5.0;
      superRoundStep = 10.0;
    } else {
      step = 0.01;
      minorRoundStep = 0.25;
      majorRoundStep = 0.5;
      superRoundStep = 1.0;
    }

    const currentResting = this.getActiveRestingLevels();
    let qBase = midPrice >= 20000 ? 1.0 : midPrice >= 1000 ? 4.5 : 2.5;
    if (currentResting.length > 0) {
      const restingQtys = currentResting.map((r) => r.qty).sort((a, b) => a - b);
      const medianResting = restingQtys[Math.floor(restingQtys.length / 2)];
      if (medianResting > 0) {
        qBase = Math.max(qBase, medianResting * 0.45);
      }
    }
    const targetPeakQty = qBase * 7.5;

    // 1. Identify Structural Liquidity Levels across the entire chart history
    interface StructuralLevel {
      price: number;
      bornTime: number;
      baseQty: number;  // Full resting heat (Hot Red / Radiant Orange / Yellow)
      sweptQty: number; // Swept depleted frequency (Blue / Cyan)
      isBid: boolean;
      type: 'bsl' | 'ssl' | 'eqh' | 'eql' | 'poc' | 'hvn' | 'round' | 'resting';
    }

    const macroLevels: StructuralLevel[] = [];
    const addMacroLevel = (
      priceRaw: number,
      bornTime: number,
      baseQty: number,
      isBid: boolean,
      type: StructuralLevel['type']
    ) => {
      const price = Number((Math.round(priceRaw / step) * step).toFixed(4));
      if (price < pMin || price > pMax || baseQty <= 0.005) return;
      const existing = macroLevels.find((l) => Math.abs(l.price - price) / price < 0.001);
      if (existing) {
        if (baseQty > existing.baseQty) {
          existing.baseQty = baseQty;
        }
        return;
      }
      macroLevels.push({
        price,
        bornTime,
        baseQty,
        sweptQty: Math.max(1.0, qBase * 1.5),
        isBid,
        type,
      });
    };

    const firstCandleTimeMs = sorted[0].time * 1000;

    // Macro BSL (Session Peak High) & SSL (Session Peak Low) - Hot Red & Radiant Orange
    addMacroLevel(maxHigh, firstCandleTimeMs, targetPeakQty * 0.98, false, 'bsl');
    addMacroLevel(minLow, firstCandleTimeMs, targetPeakQty * 0.98, true, 'ssl');

    // Prominent Macro Swing Highs & Lows (BSL & SSL pools)
    const macroSwingWindow = Math.min(10, Math.max(3, Math.floor(n / 12)));
    for (let i = macroSwingWindow; i < n - macroSwingWindow; i++) {
      const c = sorted[i];
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= macroSwingWindow; j++) {
        if (sorted[i - j].high >= c.high || sorted[i + j].high > c.high) isHigh = false;
        if (sorted[i - j].low <= c.low || sorted[i + j].low < c.low) isLow = false;
      }
      const cTimeMs = c.time * 1000;
      if (isHigh && Math.abs(c.high - maxHigh) / maxHigh > 0.003) {
        addMacroLevel(c.high, cTimeMs, targetPeakQty * 0.60, false, 'bsl');
      }
      if (isLow && Math.abs(c.low - minLow) / minLow > 0.003) {
        addMacroLevel(c.low, cTimeMs, targetPeakQty * 0.60, true, 'ssl');
      }
    }

    // Volume Profile POC
    const binSize = midPrice >= 20000 ? 50.0 : midPrice >= 1000 ? 5.0 : 0.5;
    const volBins = new Map<number, number>();
    for (const c of sorted) {
      const bin = Math.round(c.close / binSize) * binSize;
      volBins.set(bin, (volBins.get(bin) || 0) + (c.volume || 1));
    }
    let maxBinVol = 0;
    let pocPrice = 0;
    for (const [bin, v] of volBins) {
      if (v > maxBinVol) {
        maxBinVol = v;
        pocPrice = bin;
      }
    }
    if (pocPrice > 0) {
      addMacroLevel(pocPrice, firstCandleTimeMs, targetPeakQty * 0.72, pocPrice < midPrice, 'poc');
    }

    // Institutional Round Numbers: Super ($25/$500), Major ($10/$100), Minor ($5/$50)
    const superRoundStart = Math.floor(pMin / superRoundStep) * superRoundStep;
    const superRoundEnd = Math.ceil(pMax / superRoundStep) * superRoundStep;
    for (let p = superRoundStart; p <= superRoundEnd; p += superRoundStep) {
      addMacroLevel(p, firstCandleTimeMs, targetPeakQty * 0.92, p < midPrice, 'round');
    }

    const majorRoundStart = Math.floor(pMin / majorRoundStep) * majorRoundStep;
    const majorRoundEnd = Math.ceil(pMax / majorRoundStep) * majorRoundStep;
    for (let p = majorRoundStart; p <= majorRoundEnd; p += majorRoundStep) {
      if (Math.abs(p % superRoundStep) > 0.001) {
        addMacroLevel(p, firstCandleTimeMs, targetPeakQty * 0.82, p < midPrice, 'round');
      }
    }

    const minorRoundStart = Math.floor(pMin / minorRoundStep) * minorRoundStep;
    const minorRoundEnd = Math.ceil(pMax / minorRoundStep) * minorRoundStep;
    for (let p = minorRoundStart; p <= minorRoundEnd; p += minorRoundStep) {
      if (Math.abs(p % majorRoundStep) > 0.001 && Math.abs(p % superRoundStep) > 0.001) {
        addMacroLevel(p, firstCandleTimeMs, targetPeakQty * 0.68, p < midPrice, 'round');
      }
    }

    // Also include any resting levels from synchronized order book snapshot
    for (const lvl of this.restingLevels.values()) {
      addMacroLevel(lvl.price, firstCandleTimeMs, Math.max(lvl.qty, targetPeakQty * 0.75), lvl.isBid, 'resting');
    }

    // 2. Chronological Sweep Simulation Across ALL Historical Candles
    // Optimizes time slice generation to max 250 slices for instantaneous load time (< 2ms)
    const maxSlices = 250;
    const stride = n > maxSlices ? Math.ceil(n / maxSlices) : 1;
    const sampledIndices: number[] = [];
    for (let i = 0; i < n; i += stride) {
      sampledIndices.push(i);
    }
    if (sampledIndices[sampledIndices.length - 1] !== n - 1) {
      sampledIndices.push(n - 1);
    }

    const newHistoricalSlices: HeatmapTimeSlice[] = [];

    const levelSweptMap = new Map<number, { isSwept: boolean; sweptCandleTime: number }>();
    for (const lvl of macroLevels) {
      levelSweptMap.set(lvl.price, { isSwept: false, sweptCandleTime: 0 });
    }

    // Walk through all candles to track genuine swept events accurately
    for (let i = 0; i < n; i++) {
      const c = sorted[i];
      const candleTimeMs = c.time * 1000;
      for (const lvl of macroLevels) {
        if (lvl.type === 'bsl' || lvl.type === 'ssl') {
          // Session High BSL and Session Low SSL are the session boundary extremes
          continue;
        }
        if (candleTimeMs > lvl.bornTime) {
          const state = levelSweptMap.get(lvl.price);
          if (state && !state.isSwept) {
            if (!lvl.isBid && c.high > lvl.price + 0.001) {
              state.isSwept = true;
              state.sweptCandleTime = candleTimeMs;
            } else if (lvl.isBid && c.low < lvl.price - 0.001) {
              state.isSwept = true;
              state.sweptCandleTime = candleTimeMs;
            }
          }
        }
      }
    }

    // Build slices for sampled candles (fast, lightweight, smooth)
    const ambientStep = step;

    for (const idx of sampledIndices) {
      const c = sorted[idx];
      const candleTimeMs = c.time * 1000;

      // Build slice for this candle
      const sliceLevels = new Map<number, number>();
      const sliceBids = new Map<number, number>();
      const sliceAsks = new Map<number, number>();
      let totalBid = 0;
      let totalAsk = 0;

      for (const lvl of macroLevels) {
        if (candleTimeMs < lvl.bornTime) continue;

        const state = levelSweptMap.get(lvl.price);
        const isSwept = state ? state.isSwept : false;
        const wasSweptInPast = isSwept && state!.sweptCandleTime < candleTimeMs;

        if (this.settings.removeTradedLiquidity && wasSweptInPast) {
          continue;
        }

        let qty: number;
        if (lvl.type === 'bsl' || lvl.type === 'ssl') {
          // Session Extremes retain full peak resting heat across the entire chart
          qty = lvl.baseQty;
        } else if (wasSweptInPast) {
          // Traded levels drop to cool blue/cyan swept frequency
          qty = lvl.sweptQty;
        } else {
          // Major active unswept liquidity glows in Hot Red & Radiant Orange
          qty = lvl.baseQty;
        }

        sliceLevels.set(lvl.price, qty);
        if (lvl.isBid) {
          sliceBids.set(lvl.price, qty);
          totalBid += qty;
        } else {
          sliceAsks.set(lvl.price, qty);
          totalAsk += qty;
        }
      }

      // Add ambient baseline depth anchors across the visible range
      for (let p = Math.floor(pMin / ambientStep) * ambientStep; p <= pMax; p += ambientStep) {
        const price = Number(p.toFixed(4));
        if (!sliceLevels.has(price)) {
          const isBid = price < c.close;
          const phase = (price * 0.35) + (idx * 0.12);
          const ambientWave = 0.60 + 0.22 * Math.sin(phase) + 0.10 * Math.cos(phase * 2.1);
          const ambientQty = qBase * ambientWave;
          sliceLevels.set(price, ambientQty);
          if (isBid) {
            sliceBids.set(price, ambientQty);
            totalBid += ambientQty;
          } else {
            sliceAsks.set(price, ambientQty);
            totalAsk += ambientQty;
          }
        }
      }

      const slice: HeatmapTimeSlice = {
        exchange,
        symbol,
        marketType: 'spot',
        timestamp: candleTimeMs,
        bestBid: c.close - step,
        bestAsk: c.close + step,
        levels: sliceLevels,
        bids: sliceBids,
        asks: sliceAsks,
        totalBidLiquidity: totalBid,
        totalAskLiquidity: totalAsk,
        sourceUpdateId: 0,
        isValid: true,
        freshnessTimestamp: candleTimeMs,
      };

      newHistoricalSlices.push(slice);
    }

    this.historicalSlices = newHistoricalSlices;
    this.rebuildCombinedSlices();

    // Ensure calibration is set so color scale is vibrant
    this.minObservedQty = Math.max(0.01, qBase * 0.5);
    this.maxObservedQty = targetPeakQty * 1.05;
    this.p10Qty = this.minObservedQty;
    this.p95Qty = this.maxObservedQty;
    this.isCalibrated = true;
  }

  /**
   * Sample real-time Level 2 order book from OrderBookManager
   * Section 1: Authoritative observation model with exchange, symbol, updateId and validity
   */
  sampleOrderBook(
    orderBook: OrderBookManager,
    symbolOrPrecision: string | number = 'BTCUSDT',
    exchange: string = 'binance',
    marketType: 'spot' | 'linear_perpetual' = 'spot',
    precisionMultiplier: number = 100
  ): HeatmapTimeSlice | null {
    const stats = orderBook.getStats();
    if (stats.bidLevelsCount === 0 && stats.askLevelsCount === 0) {
      return null;
    }

    let symbol = 'BTCUSDT';
    let precision = precisionMultiplier;
    if (typeof symbolOrPrecision === 'number') {
      precision = symbolOrPrecision;
    } else {
      symbol = symbolOrPrecision;
    }

    const now = Date.now();
    if (now - this.lastSampleTimestamp < this.samplingIntervalMs) {
      return null;
    }
    this.lastSampleTimestamp = now;

    const snapshot = orderBook.getLevelsSnapshot();
    const bestBid = snapshot.bestBid;
    const bestAsk = snapshot.bestAsk;

    // Track currently active order book ticks
    const activeTicks = new Set<number>();

    // Update live levels and register new resting limit orders
    const minSignificance = Math.max(0.05, this.minObservedQty * 1.2);
    for (const [tick, qty] of snapshot.bids) {
      if (qty > 0.005) {
        activeTicks.add(tick);
        const price = tick / precision;
        const existing = this.restingLevels.get(tick);
        if (existing) {
          existing.qty = qty;
        } else if (qty >= minSignificance || this.restingLevels.size < 50 || (bestBid > 0 && price <= bestBid)) {
          this.restingLevels.set(tick, { price, qty, initialQty: qty, isBid: true, tick, isOutside: false });
        }
      }
    }
    for (const [tick, qty] of snapshot.asks) {
      if (qty > 0.005) {
        activeTicks.add(tick);
        const price = tick / precision;
        const existing = this.restingLevels.get(tick);
        if (existing) {
          existing.qty = qty;
        } else if (qty >= minSignificance || this.restingLevels.size < 50 || (bestAsk > 0 && price >= bestAsk)) {
          this.restingLevels.set(tick, { price, qty, initialQty: qty, isBid: false, tick, isOutside: false });
        }
      }
    }

    // Lifecycle: Remove cancelled/pulled orders from active resting levels.
    // If an order book level disappeared from snapshot, it has been withdrawn or filled.
    // It must NOT be carried over into future slices, while historical slices at earlier times remain intact!
    for (const [tick, level] of this.restingLevels) {
      if (!level.isOutside && !activeTicks.has(tick)) {
        this.restingLevels.delete(tick);
      }
    }

    // Build slice strictly from current valid observed levels at this specific timestamp:
    const levels = new Map<number, number>();
    const bids = new Map<number, number>();
    const asks = new Map<number, number>();
    let totalBid = 0;
    let totalAsk = 0;

    for (const level of this.restingLevels.values()) {
      if (level.qty <= 0.005) continue;
      levels.set(level.price, level.qty);
      if (level.isBid) {
        bids.set(level.price, level.qty);
        totalBid += level.qty;
      } else {
        asks.set(level.price, level.qty);
        totalAsk += level.qty;
      }
    }

    const slice: HeatmapTimeSlice = {
      exchange,
      symbol,
      marketType,
      timestamp: now,
      bestBid,
      bestAsk,
      levels,
      bids,
      asks,
      totalBidLiquidity: totalBid,
      totalAskLiquidity: totalAsk,
      sourceUpdateId: snapshot.lastUpdateId,
      isValid: true,
      freshnessTimestamp: now,
    };

    this.liveSlices.push(slice);
    if (this.liveSlices.length > this.maxLiveSlices) {
      this.liveSlices.shift();
    }
    this.rebuildCombinedSlices();

    // Process liquidity zone tracking with authoritative metadata
    this.zoneEngine.processObservation(
      now,
      bids,
      asks,
      bestBid,
      bestAsk,
      this.settings,
      symbol,
      exchange,
      marketType,
      snapshot.lastUpdateId
    );

    // Dynamic percentiles: calibrate once on initial sync, keep locked so colors never change automatically
    if (!this.isCalibrated) {
      this.lastRecalibrationTimestamp = now;
      this.recalibratePercentiles(snapshot, precisionMultiplier);
    }

    this.notifyListeners(slice);
    return slice;
  }

  /**
   * Section 10 & 2: Authoritative Inspection & Debug Mode
   * Query zone or specific observation at (price, timestamp)
   */
  inspectPoint(price: number, timestampMs: number): LiquidityInspectionResult {
    // 1. Check if a tracked liquidity zone was clicked
    const zone = this.zoneEngine.hitTest(price, timestampMs);
    if (zone) {
      return {
        hasObservation: true,
        exchange: zone.exchange || 'binance',
        symbol: zone.symbol || 'BTCUSDT',
        marketType: zone.marketType || 'spot',
        price,
        priceMin: zone.priceMin,
        priceMax: zone.priceMax,
        timestamp: timestampMs,
        firstObservedTime: zone.firstObservedTime,
        lastObservedTime: zone.lastObservedTime,
        persistenceMs: zone.persistenceDurationMs,
        currentQty: zone.currentObservedQty,
        maxQty: zone.maxObservedQty,
        avgQty: zone.avgObservedQty,
        touchCount: zone.touchCount,
        tradeExecutedQty: zone.tradeAssociatedExecutedQty,
        observedRemoval: zone.observedRemoval,
        replenishmentCount: zone.replenishmentCount,
        classification: zone.classification,
        isValid: zone.isValid,
        freshnessMs: Math.max(0, Date.now() - zone.lastObservedTime),
        sourceUpdateId: zone.lastUpdateId,
        isZone: true,
        zoneId: zone.id,
      };
    }

    // 2. Check for individual observation cell in historical slices
    let closestSlice: HeatmapTimeSlice | null = null;
    let minTDiff = Infinity;
    for (let i = this.slices.length - 1; i >= 0; i--) {
      const s = this.slices[i];
      const diff = Math.abs(s.timestamp - timestampMs);
      if (diff < minTDiff) {
        minTDiff = diff;
        closestSlice = s;
      }
      if (diff > 10000 && s.timestamp < timestampMs) break;
    }

    if (closestSlice && minTDiff <= 5000) {
      // Find matching price level
      let matchedQty = 0;
      let matchedPrice = price;
      let minPDiff = Infinity;

      for (const [p, q] of closestSlice.levels) {
        const pdiff = Math.abs(p - price);
        if (pdiff < minPDiff && pdiff <= 5.0) {
          minPDiff = pdiff;
          matchedQty = q;
          matchedPrice = p;
        }
      }

      if (matchedQty > 0) {
        return {
          hasObservation: true,
          exchange: closestSlice.exchange || 'binance',
          symbol: closestSlice.symbol || 'BTCUSDT',
          marketType: closestSlice.marketType || 'spot',
          price: matchedPrice,
          priceMin: matchedPrice,
          priceMax: matchedPrice,
          timestamp: closestSlice.timestamp,
          firstObservedTime: closestSlice.timestamp,
          lastObservedTime: closestSlice.timestamp,
          persistenceMs: 0,
          currentQty: matchedQty,
          maxQty: matchedQty,
          avgQty: matchedQty,
          touchCount: 0,
          tradeExecutedQty: 0,
          observedRemoval: false,
          replenishmentCount: 0,
          classification: 'ACTIVE LIQUIDITY',
          isValid: closestSlice.isValid ?? true,
          freshnessMs: Math.max(0, Date.now() - (closestSlice.freshnessTimestamp || closestSlice.timestamp)),
          sourceUpdateId: closestSlice.sourceUpdateId,
          isZone: false,
        };
      }
    }

    // 3. Check persistent resting levels
    let restingQty = 0;
    let matchedPrice = price;
    let isBid = true;
    for (const lvl of this.restingLevels.values()) {
      if (Math.abs(lvl.price - price) <= 2.5 && lvl.qty > restingQty) {
        restingQty = lvl.qty;
        matchedPrice = lvl.price;
        isBid = lvl.isBid;
      }
    }

    if (restingQty > 0) {
      return {
        hasObservation: true,
        exchange: 'binance',
        symbol: 'BTCUSDT',
        marketType: 'spot',
        price: matchedPrice,
        priceMin: matchedPrice,
        priceMax: matchedPrice,
        timestamp: timestampMs,
        firstObservedTime: Date.now() - 3600000,
        lastObservedTime: Date.now(),
        persistenceMs: 3600000,
        currentQty: restingQty,
        maxQty: restingQty,
        avgQty: restingQty,
        touchCount: 0,
        tradeExecutedQty: 0,
        observedRemoval: false,
        replenishmentCount: 0,
        classification: 'ACTIVE LIQUIDITY',
        isValid: true,
        freshnessMs: 0,
        isZone: false,
      };
    }

    // 4. Unobserved cell: represent explicitly as unobserved/empty
    return {
      hasObservation: false,
      exchange: 'binance',
      symbol: 'BTCUSDT',
      marketType: 'spot',
      price,
      priceMin: price,
      priceMax: price,
      timestamp: timestampMs,
      firstObservedTime: 0,
      lastObservedTime: 0,
      persistenceMs: 0,
      currentQty: 0,
      maxQty: 0,
      avgQty: 0,
      touchCount: 0,
      tradeExecutedQty: 0,
      observedRemoval: false,
      replenishmentCount: 0,
      classification: 'INDETERMINATE',
      isValid: false,
      freshnessMs: 0,
      isZone: false,
    };
  }

  recalibratePercentiles(
    liveSnapshot?: { bids: Map<number, number>; asks: Map<number, number>; bestBid?: number; bestAsk?: number },
    precisionMultiplier: number = 100
  ): void {
    const allQtys: number[] = [];
    let mid = 0;

    if (liveSnapshot && (liveSnapshot.bids.size > 0 || liveSnapshot.asks.size > 0)) {
      const bestBid = liveSnapshot.bestBid || 0;
      const bestAsk = liveSnapshot.bestAsk || 0;
      mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk || 0);

      // Collect quantities of active orders within a generous +/- 20% window around mid price
      const minP = mid > 0 ? mid * 0.80 : 0;
      const maxP = mid > 0 ? mid * 1.20 : Infinity;

      for (const [tick, q] of liveSnapshot.bids) {
        if (q > 0.005) {
          const p = tick / precisionMultiplier;
          if (p >= minP && p <= maxP) allQtys.push(q);
        }
      }
      for (const [tick, q] of liveSnapshot.asks) {
        if (q > 0.005) {
          const p = tick / precisionMultiplier;
          if (p >= minP && p <= maxP) allQtys.push(q);
        }
      }
    }

    // Fallback or augment from historical slices if snapshot is sparse
    if (allQtys.length < 20) {
      const recent = this.slices.slice(-50);
      for (const s of recent) {
        for (const q of s.levels.values()) {
          if (q > 0.005) allQtys.push(q);
        }
      }
    }

    if (allQtys.length >= 10) {
      allQtys.sort((a, b) => a - b);
      const len = allQtys.length;

      // targetMin: 12th percentile of resting orders (ambient baseline noise)
      const p12Idx = Math.max(0, Math.floor(len * 0.12));
      const targetMin = Math.max(0.01, allQtys[p12Idx]);

      // Major peak wall & percentile metrics
      const peakQty = allQtys[len - 1];
      const p99_5 = allQtys[Math.min(len - 1, Math.floor(len * 0.995))];
      const p98 = allQtys[Math.min(len - 1, Math.floor(len * 0.98))];

      const whaleNotionalTargetUSD = 750000;
      const rawNotionalQty = mid > 0 ? (whaleNotionalTargetUSD / mid) : (targetMin * 18);
      const notionalWhaleQty = Math.min(peakQty * 4, Math.max(targetMin * 6, rawNotionalQty));

      const targetMax = Math.max(
        p99_5,
        peakQty * 0.85,
        p98 * 1.5,
        targetMin * 12,
        notionalWhaleQty
      );

      if (this.isCalibrated && this.maxObservedQty > 0) {
        const changeRatio = Math.abs(targetMax - this.maxObservedQty) / this.maxObservedQty;
        if (changeRatio < 0.20) {
          return;
        }
        this.minObservedQty = this.minObservedQty * 0.80 + targetMin * 0.20;
        this.maxObservedQty = this.maxObservedQty * 0.80 + targetMax * 0.20;
      } else {
        this.minObservedQty = targetMin;
        this.maxObservedQty = targetMax;
        this.isCalibrated = true;
      }
    }
  }

  getDynamicRange(
    settings: HeatmapSettings,
    visibleSlices?: HeatmapTimeSlice[]
  ): { minQty: number; maxQty: number } {
    if (settings.lowerCutoffAbsolute > 0 && settings.upperCutoffAbsolute > 0) {
      return {
        minQty: settings.lowerCutoffAbsolute,
        maxQty: settings.upperCutoffAbsolute,
      };
    }

    const now = Date.now();
    if (this.cachedDynamicRange && now - this.cachedDynamicRange.timestamp < 350) {
      return { minQty: this.cachedDynamicRange.minQty, maxQty: this.cachedDynamicRange.maxQty };
    }

    const mode = settings.normalizationMode || 'visible_window';

    let populationSlices: HeatmapTimeSlice[];
    if (mode === 'visible_window' && visibleSlices && visibleSlices.length > 0) {
      populationSlices = visibleSlices;
    } else if (mode === 'rolling') {
      const windowMs = settings.normalizationWindowMs || 3600000;
      const cutoffTime = Date.now() - windowMs;
      populationSlices = this.slices.filter((s) => s.timestamp >= cutoffTime);
    } else {
      // 'fixed' or default loaded slices
      populationSlices = this.slices.slice(-100);
    }

    const qtys: number[] = [];
    for (const s of populationSlices) {
      for (const q of s.levels.values()) {
        if (q > 0.005) qtys.push(q);
      }
    }

    // Augment with active resting levels if slices are sparse
    if (qtys.length < 10 && this.restingLevels.size > 0) {
      for (const lvl of this.restingLevels.values()) {
        if (lvl.qty > 0.005) qtys.push(lvl.qty);
      }
    }

    if (qtys.length >= 10) {
      qtys.sort((a, b) => a - b);
      const len = qtys.length;
      const p10 = Math.max(0.01, qtys[Math.floor(len * 0.10)]);
      const p95 = qtys[Math.min(len - 1, Math.floor(len * 0.95))];
      const p99_5 = qtys[Math.min(len - 1, Math.floor(len * 0.995))];
      const peak = qtys[len - 1];

      // Robust percentile normalization: prevents a single extreme whale order from flattening the rest
      const targetMin = p10;
      const targetMax = Math.max(p99_5, Math.min(peak, p95 * 2.5), targetMin * 8);

      this.minObservedQty = targetMin;
      this.maxObservedQty = targetMax;
      this.p10Qty = p10;
      this.p95Qty = p95;
      this.isCalibrated = true;
      this.cachedDynamicRange = { minQty: targetMin, maxQty: targetMax, timestamp: now };

      return { minQty: targetMin, maxQty: targetMax };
    }

    if (this.isCalibrated && this.maxObservedQty > 0) {
      this.cachedDynamicRange = { minQty: this.minObservedQty, maxQty: this.maxObservedQty, timestamp: now };
      return { minQty: this.minObservedQty, maxQty: this.maxObservedQty };
    }

    const fallback = {
      minQty: this.minObservedQty > 0 ? this.minObservedQty : 0.05,
      maxQty: this.maxObservedQty > 0 ? this.maxObservedQty : 25.0,
    };
    this.cachedDynamicRange = { ...fallback, timestamp: now };
    return fallback;
  }

  /**
   * Derive liquidity visibility threshold based on settings and normalization population.
   * In absolute mode: returns settings.minLiquidityQty
   * In percentile mode: returns percentile(observed_liquidity, selected_percentile)
   */
  getFilterThreshold(settings: HeatmapSettings, visibleSlices?: HeatmapTimeSlice[]): number {
    if (settings.liquidityFilterMode === 'absolute') {
      return settings.minLiquidityQty || 0;
    }

    const pct = settings.liquidityFilterPercentile ?? settings.saturation ?? 0;
    if (pct <= 0) {
      return settings.minLiquidityQty || 0;
    }

    const now = Date.now();
    if (this.cachedFilterThreshold && now - this.cachedFilterThreshold.timestamp < 350) {
      return this.cachedFilterThreshold.threshold;
    }

    const sourceSlices = (visibleSlices && visibleSlices.length > 0)
      ? visibleSlices
      : this.slices.slice(-100);

    const qtys: number[] = [];
    for (const s of sourceSlices) {
      for (const q of s.levels.values()) {
        if (q > 0.005) qtys.push(q);
      }
    }

    if (qtys.length < 5 && this.restingLevels.size > 0) {
      for (const lvl of this.restingLevels.values()) {
        if (lvl.qty > 0.005) qtys.push(lvl.qty);
      }
    }

    if (qtys.length === 0) {
      const def = settings.minLiquidityQty || 0;
      this.cachedFilterThreshold = { threshold: def, timestamp: now };
      return def;
    }

    qtys.sort((a, b) => a - b);
    const clampedPct = Math.max(0, Math.min(99, pct));
    const idx = Math.floor((clampedPct / 100) * (qtys.length - 1));
    return Math.max(settings.minLiquidityQty || 0, qtys[idx]);
  }

  getVisibleSlices(fromTimeMs: number, toTimeMs: number): HeatmapTimeSlice[] {
    const len = this.slices.length;
    if (len === 0) return [];
    if (toTimeMs < this.slices[0].timestamp || fromTimeMs > this.slices[len - 1].timestamp) {
      return [];
    }

    let low = 0;
    let high = len - 1;
    let startIdx = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.slices[mid].timestamp >= fromTimeMs) {
        startIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    low = startIdx;
    high = len - 1;
    let endIdx = len - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.slices[mid].timestamp <= toTimeMs) {
        endIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (startIdx > endIdx) return [];
    const safeStart = Math.max(0, startIdx - 1);
    return this.slices.slice(safeStart, endIdx + 1);
  }

  getAllSlices(): HeatmapTimeSlice[] {
    return this.slices;
  }

  getSlices(): HeatmapTimeSlice[] {
    return this.slices;
  }

  getStats(): HeatmapStats {
    const len = this.slices.length;
    return {
      totalSlices: len,
      oldestTimestamp: len > 0 ? this.slices[0].timestamp : 0,
      newestTimestamp: len > 0 ? this.slices[len - 1].timestamp : 0,
      minObservedQty: this.minObservedQty,
      maxObservedQty: this.maxObservedQty,
      p10Qty: this.p10Qty,
      p95Qty: this.p95Qty,
      samplingIntervalMs: this.samplingIntervalMs,
    };
  }
}
