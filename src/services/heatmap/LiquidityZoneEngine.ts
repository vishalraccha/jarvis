/**
 * Liquidity Zone Engine & Price-Level Aggregation Layer
 * Implements persistent zone detection, statistical significance scoring,
 * hysteresis lifecycle management, and clean continuous history segmentation
 * JARVIS HEATMAP TERMINAL
 */

import { HeatmapSettings, LiquidityZone, LiquidityZoneState, ZoneHistorySegment } from '../../types/heatmap';
import { DEFAULT_HEATMAP_SETTINGS } from '../../types/settings';
import { MarketTrade } from '../../types/market';

export interface AggregatedPriceBucket {
  price: number;
  totalQty: number;
  maxQty: number;
  bidQty: number;
  askQty: number;
  rawLevelsCount: number;
}

export type ZoneUpdateCallback = (zones: LiquidityZone[]) => void;

export class LiquidityZoneEngine {
  private zones: Map<string, LiquidityZone> = new Map();
  private nextZoneId: number = 1;
  private tickSize: number = 0.01;
  private maxRetainedHistoryMs: number = 7200000; // 2 hours

  private listeners: Set<ZoneUpdateCallback> = new Set();

  constructor(tickSize: number = 0.01) {
    this.tickSize = tickSize > 0 ? tickSize : 0.01;
  }

  setTickSize(tickSize: number): void {
    this.tickSize = tickSize > 0 ? tickSize : 0.01;
  }

  subscribe(callback: ZoneUpdateCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const list = Array.from(this.zones.values());
    for (const l of this.listeners) {
      l(list);
    }
  }

  clear(): void {
    this.zones.clear();
    this.notifyListeners();
  }

  /**
   * Section 3: Aggregate raw Level 2 order book into configurable display price buckets
   */
  aggregateLevels(
    bids: Map<number, number>,
    asks: Map<number, number>,
    settings: HeatmapSettings
  ): Map<number, AggregatedPriceBucket> {
    const aggTicks = Math.max(1, settings.priceAggregationTicks || 1);
    const bucketSize = this.tickSize * aggTicks;
    const precision = Math.max(0, Math.ceil(-Math.log10(this.tickSize)) + 2);
    const toBucketPrice = (p: number) => Number((Math.floor(p / bucketSize) * bucketSize).toFixed(precision));
    const buckets = new Map<number, AggregatedPriceBucket>();

    // Aggregate Bids
    for (const [price, qty] of bids) {
      if (qty <= 0) continue;
      const bPrice = toBucketPrice(price);
      const existing = buckets.get(bPrice);
      if (!existing) {
        buckets.set(bPrice, {
          price: bPrice,
          totalQty: qty,
          maxQty: qty,
          bidQty: qty,
          askQty: 0,
          rawLevelsCount: 1,
        });
      } else {
        existing.totalQty += qty;
        existing.maxQty = Math.max(existing.maxQty, qty);
        existing.bidQty += qty;
        existing.rawLevelsCount += 1;
      }
    }

    // Aggregate Asks
    for (const [price, qty] of asks) {
      if (qty <= 0) continue;
      const bPrice = toBucketPrice(price);
      const existing = buckets.get(bPrice);
      if (!existing) {
        buckets.set(bPrice, {
          price: bPrice,
          totalQty: qty,
          maxQty: qty,
          bidQty: 0,
          askQty: qty,
          rawLevelsCount: 1,
        });
      } else {
        existing.totalQty += qty;
        existing.maxQty = Math.max(existing.maxQty, qty);
        existing.askQty += qty;
        existing.rawLevelsCount += 1;
      }
    }

    return buckets;
  }

  /**
   * Section 4 & 7: Process a live or historical observation time slice
   * Detects clusters, calculates relative significance, and updates zone state machine
   */
  processObservation(
    timestamp: number,
    bids: Map<number, number>,
    asks: Map<number, number>,
    bestBid: number,
    bestAsk: number,
    settings: HeatmapSettings,
    symbol: string = 'BTCUSDT',
    exchange: string = 'binance',
    marketType: string = 'spot',
    sourceUpdateId?: number
  ): void {
    const buckets = this.aggregateLevels(bids, asks, settings);
    if (buckets.size === 0) {
      this.pruneUnobservedZones(timestamp, new Set(), settings);
      this.notifyListeners();
      return;
    }

    // Filter buckets meeting minimum criteria
    const validBuckets: AggregatedPriceBucket[] = [];
    const minQty = Math.max(0.1, settings.minLiquidityQty || 1.0);
    const minNotional = settings.minLiquidityNotional || 0;

    for (const b of buckets.values()) {
      if (b.totalQty < minQty) continue;
      if (minNotional > 0 && b.totalQty * b.price < minNotional) continue;

      // Filter filled/traded liquidity if enabled
      if (settings.removeTradedLiquidity) {
        if (b.askQty > 0 && bestBid > 0 && b.price <= bestBid) continue;
        if (b.bidQty > 0 && bestAsk > 0 && b.price >= bestAsk) continue;
      }

      validBuckets.push(b);
    }

    if (validBuckets.length === 0) {
      this.pruneUnobservedZones(timestamp, new Set(), settings);
      return;
    }

    // Calculate volume distribution for statistical scoring
    const allQtys = validBuckets.map((b) => b.totalQty).sort((a, b) => a - b);
    const medianQty = allQtys[Math.floor(allQtys.length * 0.5)] || 1;

    // Sort valid buckets by price for clustering
    validBuckets.sort((a, b) => a.price - b.price);

    // Merge adjacent buckets within mergeDistanceTicks into candidate clusters
    const aggTicks = Math.max(1, settings.priceAggregationTicks || 1);
    const bucketSize = this.tickSize * aggTicks;
    const mergeDistance = Math.max(bucketSize * 1.5, this.tickSize * (settings.zoneMergeDistanceTicks || 2));

    interface DetectedCluster {
      priceMin: number;
      priceMax: number;
      centerPrice: number;
      totalQty: number;
      peakQty: number;
      isBid: boolean;
      significance: number;
    }

    const clusters: DetectedCluster[] = [];
    let currentCluster: {
      buckets: AggregatedPriceBucket[];
      priceMin: number;
      priceMax: number;
      isBid: boolean;
    } | null = null;

    for (const b of validBuckets) {
      const isBid = b.bidQty >= b.askQty;

      if (!currentCluster) {
        currentCluster = {
          buckets: [b],
          priceMin: b.price,
          priceMax: b.price + bucketSize,
          isBid,
        };
      } else {
        const gap = b.price - currentCluster.priceMax;
        if (gap <= mergeDistance && currentCluster.isBid === isBid) {
          // Merge into cluster
          currentCluster.buckets.push(b);
          currentCluster.priceMax = b.price + bucketSize;
        } else {
          // Finalize current cluster
          const tot = currentCluster.buckets.reduce((acc, curr) => acc + curr.totalQty, 0);
          const peak = currentCluster.buckets.reduce((acc, curr) => Math.max(acc, curr.totalQty), 0);
          const volRatio = Math.min(3, tot / Math.max(0.1, medianQty));
          const score = Math.min(100, Math.round(volRatio * 35));

          clusters.push({
            priceMin: currentCluster.priceMin,
            priceMax: currentCluster.priceMax,
            centerPrice: (currentCluster.priceMin + currentCluster.priceMax) / 2,
            totalQty: tot,
            peakQty: peak,
            isBid: currentCluster.isBid,
            significance: score,
          });

          // Start new cluster
          currentCluster = {
            buckets: [b],
            priceMin: b.price,
            priceMax: b.price + bucketSize,
            isBid,
          };
        }
      }
    }

    if (currentCluster) {
      const tot = currentCluster.buckets.reduce((acc, curr) => acc + curr.totalQty, 0);
      const peak = currentCluster.buckets.reduce((acc, curr) => Math.max(acc, curr.totalQty), 0);
      const volRatio = Math.min(3, tot / Math.max(0.1, medianQty));
      const score = Math.min(100, Math.round(volRatio * 35));

      clusters.push({
        priceMin: currentCluster.priceMin,
        priceMax: currentCluster.priceMax,
        centerPrice: (currentCluster.priceMin + currentCluster.priceMax) / 2,
        totalQty: tot,
        peakQty: peak,
        isBid: currentCluster.isBid,
        significance: score,
      });
    }

    // Update zone state machine with detected clusters
    const observedZoneIds = new Set<string>();

    for (const cl of clusters) {
      // Find matching existing zone
      let matchedZone: LiquidityZone | null = null;
      let minDistance = Number.MAX_VALUE;

      for (const z of this.zones.values()) {
        if (z.isBid !== cl.isBid) continue;
        if (z.state === 'removed' || z.state === 'expired') continue;

        const overlap = Math.min(z.priceMax, cl.priceMax) - Math.max(z.priceMin, cl.priceMin);
        const distance = Math.abs(z.centerPrice - cl.centerPrice);

        if (overlap > 0 || distance <= mergeDistance) {
          if (distance < minDistance) {
            minDistance = distance;
            matchedZone = z;
          }
        }
      }

      if (matchedZone) {
        observedZoneIds.add(matchedZone.id);
        const prevQty = matchedZone.currentObservedQty;
        matchedZone.lastObservedTime = timestamp;
        matchedZone.observationCount += 1;
        matchedZone.persistenceDurationMs = timestamp - matchedZone.firstObservedTime;
        matchedZone.maxObservedQty = Math.max(matchedZone.maxObservedQty, cl.peakQty);
        matchedZone.currentObservedQty = cl.totalQty;
        matchedZone.avgObservedQty =
          (matchedZone.avgObservedQty * (matchedZone.observationCount - 1) + cl.totalQty) /
          matchedZone.observationCount;
        matchedZone.isValid = true;
        if (sourceUpdateId) matchedZone.lastUpdateId = sourceUpdateId;

        // Check for replenishment: if liquidity increases significantly after trade/depletion
        if (
          (matchedZone.classification === 'PARTIALLY DEPLETED' ||
            matchedZone.classification === 'TRADE-ASSOCIATED DEPLETION') &&
          cl.totalQty > prevQty + 0.5
        ) {
          matchedZone.replenishmentCount += 1;
          matchedZone.classification = 'REPLENISHED';
        } else if (matchedZone.classification === 'ACTIVE LIQUIDITY') {
          // Check proximity: APPROACHED state
          const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk || cl.centerPrice);
          const distToMid = Math.abs(cl.centerPrice - mid);
          const proximityThreshold = bucketSize * 6;
          if (distToMid <= proximityThreshold) {
            matchedZone.classification = 'APPROACHED';
          }
        }

        // Dynamic significance scoring incorporating persistence
        const persistenceBonus = Math.min(25, Math.floor(matchedZone.persistenceDurationMs / 1000) * 2);
        const dynamicSignificance = Math.min(100, cl.significance + persistenceBonus);
        matchedZone.relativeSignificance = Math.round(
          matchedZone.relativeSignificance * 0.65 + dynamicSignificance * 0.35
        );

        // Update active history segment
        const segs = matchedZone.historySegments;
        if (segs.length > 0) {
          const lastSeg = segs[segs.length - 1];
          lastSeg.endTime = timestamp;
          lastSeg.maxQty = Math.max(lastSeg.maxQty, cl.peakQty);
          lastSeg.avgQty = (lastSeg.avgQty + cl.totalQty) / 2;
          lastSeg.significance = matchedZone.relativeSignificance;
        }

        // Hysteresis State Transitions (Section 4)
        const minDuration = settings.zoneMinDurationMs || 1500;
        const actThresh = settings.zoneActivationThreshold || 75;
        const deactThresh = settings.zoneDeactivationThreshold || 50;

        if (matchedZone.state === 'candidate') {
          if (matchedZone.persistenceDurationMs >= minDuration && matchedZone.relativeSignificance >= actThresh) {
            matchedZone.state = 'active';
          }
        } else if (matchedZone.state === 'active') {
          if (matchedZone.relativeSignificance < deactThresh) {
            matchedZone.state = 'weakening';
          }
        } else if (matchedZone.state === 'weakening') {
          if (matchedZone.relativeSignificance >= actThresh) {
            matchedZone.state = 'active';
          }
        }
      } else {
        // Create new candidate zone with authoritative data model
        const zoneId = `z_${this.nextZoneId++}`;
        observedZoneIds.add(zoneId);

        const newZone: LiquidityZone = {
          id: zoneId,
          exchange,
          symbol,
          marketType,
          priceMin: cl.priceMin,
          priceMax: cl.priceMax,
          centerPrice: cl.centerPrice,
          firstObservedTime: timestamp,
          lastObservedTime: timestamp,
          maxObservedQty: cl.peakQty,
          avgObservedQty: cl.totalQty,
          currentObservedQty: cl.totalQty,
          persistenceDurationMs: 0,
          relativeSignificance: cl.significance,
          state: cl.significance >= (settings.zoneActivationThreshold || 75) ? 'active' : 'candidate',
          classification: 'ACTIVE LIQUIDITY',
          isBid: cl.isBid,
          observationCount: 1,
          touchCount: 0,
          tradeCount: 0,
          tradeAssociatedExecutedQty: 0,
          observedRemoval: false,
          replenishmentCount: 0,
          isValid: true,
          lastUpdateId: sourceUpdateId,
          historySegments: [
            {
              startTime: timestamp,
              endTime: timestamp,
              avgQty: cl.totalQty,
              maxQty: cl.peakQty,
              significance: cl.significance,
            },
          ],
        };

        this.zones.set(zoneId, newZone);
      }
    }

    this.pruneUnobservedZones(timestamp, observedZoneIds, settings);
    this.notifyListeners();
  }

  /**
   * Section 5: Update zones that were not observed in the current observation slice
   * Preserves historical portions without erasing or shifting them!
   * Accurately distinguishes between POSSIBLY PULLED vs executed depletion!
   */
  private pruneUnobservedZones(
    timestamp: number,
    observedZoneIds: Set<string>,
    settings: HeatmapSettings
  ): void {
    const timeoutMs = (settings.staleLevelTimeoutSec || 180) * 1000;

    for (const [id, z] of this.zones.entries()) {
      if (observedZoneIds.has(id)) continue;

      if (z.state === 'active' || z.state === 'candidate' || z.state === 'weakening') {
        z.currentObservedQty = 0;
        const timeSinceLastObs = timestamp - z.lastObservedTime;
        if (timeSinceLastObs >= 500) {
          if (z.state === 'active') {
            z.state = 'weakening';
          } else if (timeSinceLastObs >= 2000) {
            // Zone no longer observed: stop extending active zone, freeze history segment
            z.state = 'removed';
            z.observedRemoval = true;
            const segs = z.historySegments;
            if (segs.length > 0) {
              segs[segs.length - 1].endTime = z.lastObservedTime;
            }

            // Evidence-Based Classification: If liquidity disappeared without executed trades,
            // label as POSSIBLY PULLED (order cancelled / withdrawn) rather than swept!
            if (z.tradeAssociatedExecutedQty <= 0.05 && z.classification !== 'SWEPT / TRADED THROUGH') {
              z.classification = 'POSSIBLY PULLED';
            }
          }
        }
      } else if (z.state === 'removed') {
        // Expire zones older than max retained history
        if (timestamp - z.lastObservedTime > this.maxRetainedHistoryMs) {
          z.state = 'expired';
          this.zones.delete(id);
        }
      }
    }
  }

  /**
   * Section 6: Evidence-Based Liquidity Interaction & Sweep Classifier
   * Requires SUFFICIENT trade evidence AND price movement through the relevant range!
   * A reduction in displayed depth alone does NOT prove that orders were executed.
   */
  recordTrade(trade: MarketTrade, settings: HeatmapSettings): void {
    for (const z of this.zones.values()) {
      if (z.state === 'expired') continue;

      // 1. Check if trade executed inside zone bounds
      const tradeInsideZone = trade.price >= z.priceMin && trade.price <= z.priceMax;

      if (tradeInsideZone) {
        z.touchCount += 1;
        z.tradeCount = (z.tradeCount || 0) + 1;
        z.tradeAssociatedExecutedQty += trade.quantity;

        // Sweep evidence threshold: substantial volume must trade through the zone
        const sweepVolumeRequired = Math.min(Math.max(0.5, z.maxObservedQty * 0.4), 2.0);

        // Check if price moved through the zone
        const tradedThroughAsk = !z.isBid && trade.price >= z.priceMax - this.tickSize;
        const tradedThroughBid = z.isBid && trade.price <= z.priceMin + this.tickSize;

        if (z.tradeAssociatedExecutedQty >= sweepVolumeRequired && (tradedThroughAsk || tradedThroughBid)) {
          // Both conditions met: substantial trade volume AND price movement through range!
          z.classification = 'SWEPT / TRADED THROUGH';
          z.state = 'removed';
          z.lastObservedTime = trade.timestamp;
          const segs = z.historySegments;
          if (segs.length > 0) {
            segs[segs.length - 1].endTime = trade.timestamp;
          }
        } else if (z.tradeAssociatedExecutedQty > 0) {
          z.classification = 'TRADE-ASSOCIATED DEPLETION';
        } else {
          z.classification = 'TOUCHED';
        }
      } else if (z.state === 'active' || z.state === 'weakening') {
        // Check if price penetrated beyond zone after previous touches
        if (z.touchCount > 0) {
          const sweptPastAsk = !z.isBid && trade.price > z.priceMax;
          const sweptPastBid = z.isBid && trade.price < z.priceMin;
          const sweepVolumeRequired = Math.min(Math.max(0.5, z.maxObservedQty * 0.35), 2.0);

          if ((sweptPastAsk || sweptPastBid) && z.tradeAssociatedExecutedQty >= sweepVolumeRequired) {
            z.classification = 'SWEPT / TRADED THROUGH';
            z.state = 'removed';
            z.lastObservedTime = trade.timestamp;
            const segs = z.historySegments;
            if (segs.length > 0) {
              segs[segs.length - 1].endTime = trade.timestamp;
            }
          }
        }
      }
    }
  }

  /**
   * Evidence-based classifier helper
   */
  classifyTradeInteraction(
    trade: MarketTrade,
    _lowPrice?: number,
    _highPrice?: number,
    settings?: HeatmapSettings
  ): void {
    this.recordTrade(trade, settings || DEFAULT_HEATMAP_SETTINGS);
  }

  /**
   * Query visible zones within viewport time and price bounds
   * Prioritized by relative significance score up to maxOutlinedZones (rendering budget)
   */
  getVisibleZones(
    fromTimeMs: number,
    toTimeMs: number,
    minPrice: number,
    maxPrice: number,
    settings: HeatmapSettings
  ): LiquidityZone[] {
    const matched: LiquidityZone[] = [];

    for (const z of this.zones.values()) {
      if (z.state === 'expired') continue;
      // Price overlap check
      if (z.priceMax < minPrice || z.priceMin > maxPrice) continue;
      // Time overlap check (never stretch past lastObservedTime!)
      if (z.lastObservedTime < fromTimeMs || z.firstObservedTime > toTimeMs) continue;

      // Filter by minimum required significance if set
      if (z.relativeSignificance < (settings.lowerCutoffPercentile || 5)) continue;

      matched.push(z);
    }

    // Sort by significance descending
    matched.sort((a, b) => b.relativeSignificance - a.relativeSignificance);

    const budget = settings.maxOutlinedZones || 15;
    return matched.slice(0, budget);
  }

  getAllZones(): LiquidityZone[] {
    return Array.from(this.zones.values());
  }

  /**
   * Section 10: Hover / Click Hit Test for Inspector
   * Returns zone matching pointer price and time coordinates
   */
  hitTest(price: number, timeMs: number): LiquidityZone | null {
    let bestZone: LiquidityZone | null = null;
    let minDistance = Number.MAX_VALUE;

    for (const z of this.zones.values()) {
      if (z.state === 'expired') continue;
      if (timeMs < z.firstObservedTime - 2000 || timeMs > z.lastObservedTime + 2000) continue;

      if (price >= z.priceMin && price <= z.priceMax) {
        return z;
      }

      const dist = Math.abs(price - z.centerPrice);
      if (dist <= (z.priceMax - z.priceMin) * 1.5 && dist < minDistance) {
        minDistance = dist;
        bestZone = z;
      }
    }

    return bestZone;
  }
}
