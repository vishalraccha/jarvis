/**
 * Liquidity Shift Detector
 * Detects resting limit additions, cancellations, movements, and trade depletions
 * JARVIS HEATMAP TERMINAL
 */

import { HeatmapTimeSlice, LiquidityShiftEvent } from '../../types/heatmap';
import { MarketTrade } from '../../types/market';

export class LiquidityShiftDetector {
  private recentTrades: MarketTrade[] = [];
  private maxRetainedTrades: number = 500;
  private significantChanges: LiquidityShiftEvent[] = [];
  private maxRetainedEvents: number = 1000;

  // Minimum threshold to consider a shift significant (e.g. >= 0.5 BTC or >= 50% change)
  private minAbsoluteChange: number = 0.5;
  private minPercentChange: number = 30; // 30%

  recordTrade(trade: MarketTrade): void {
    this.recentTrades.push(trade);
    if (this.recentTrades.length > this.maxRetainedTrades) {
      this.recentTrades.shift();
    }
  }

  detectShifts(
    prevSlice: HeatmapTimeSlice | null,
    currentSlice: HeatmapTimeSlice
  ): LiquidityShiftEvent[] {
    if (!prevSlice) return [];

    const newEvents: LiquidityShiftEvent[] = [];
    const timestamp = currentSlice.timestamp;
    const timeDeltaMs = timestamp - prevSlice.timestamp;

    // Check all levels in current slice against previous slice
    const allPrices = new Set<number>([
      ...Array.from(prevSlice.levels.keys()),
      ...Array.from(currentSlice.levels.keys()),
    ]);

    for (const price of allPrices) {
      const prevQty = prevSlice.levels.get(price) || 0;
      const currQty = currentSlice.levels.get(price) || 0;
      const deltaQty = currQty - prevQty;
      const absChange = Math.abs(deltaQty);

      if (absChange < this.minAbsoluteChange) {
        continue; // Filter small changes
      }

      const pctChange = prevQty > 0 ? (deltaQty / prevQty) * 100 : 100;

      // Determine shift classification
      let type: LiquidityShiftEvent['type'] = 'added';
      let attribution: LiquidityShiftEvent['attribution'] = 'inferred';

      const isAsk = price >= currentSlice.bestAsk;

      if (deltaQty > 0) {
        if (prevQty === 0) {
          type = 'added';
        } else {
          type = 'replenished';
        }
      } else {
        // Liquidity decreased
        // Check if there was an executed trade matching this price in the recent trade window
        const matchingTrade = this.findMatchingTrade(price, currentSlice.timestamp - timeDeltaMs, currentSlice.timestamp);

        if (matchingTrade && Math.abs(matchingTrade.quantity - absChange) / absChange < 0.3) {
          type = 'depleted_by_trade';
          attribution = 'observed';
        } else if (currQty === 0) {
          type = 'removed';
          attribution = 'inferred';
        } else {
          type = 'reduced';
          attribution = 'inferred';
        }
      }

      const event: LiquidityShiftEvent = {
        id: `${timestamp}_${price}_${type}`,
        timestamp,
        price,
        type,
        deltaQty,
        absChange,
        pctChange,
        previousQty: prevQty,
        currentQty: currQty,
        isAsk,
        attribution,
      };

      newEvents.push(event);
      this.significantChanges.push(event);
    }

    if (this.significantChanges.length > this.maxRetainedEvents) {
      this.significantChanges.splice(0, this.significantChanges.length - this.maxRetainedEvents);
    }

    return newEvents;
  }

  private findMatchingTrade(price: number, fromTime: number, toTime: number): MarketTrade | undefined {
    return this.recentTrades.find(
      (t) =>
        t.timestamp >= fromTime - 300 &&
        t.timestamp <= toTime + 300 &&
        Math.abs(t.price - price) <= 0.05
    );
  }

  getRecentEvents(fromTimestamp: number): LiquidityShiftEvent[] {
    return this.significantChanges.filter((e) => e.timestamp >= fromTimestamp);
  }

  clear(): void {
    this.recentTrades = [];
    this.significantChanges = [];
  }
}
