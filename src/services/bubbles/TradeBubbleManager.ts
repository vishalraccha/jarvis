/**
 * Trade Bubble Manager
 * Aggregates real exchange market trades into 3D volume bubbles with buyer/seller split
 * JARVIS HEATMAP TERMINAL
 */

import { BubbleSettings, TradeBubble } from '../../types/heatmap';
import { MarketTrade } from '../../types/market';

export class TradeBubbleManager {
  private bubbles: TradeBubble[] = [];
  private bubblesByBarTime: Map<number, TradeBubble> = new Map();
  private maxRetainedBubbles: number = 2000;
  private timeframeSeconds: number = 0; // 0 means use aggregationIntervalMs

  private settings: BubbleSettings;
  private listeners: Set<() => void> = new Set();

  constructor(settings: BubbleSettings) {
    this.settings = settings;
  }

  setTimeframe(tf: string | number): void {
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
    if (typeof tf === 'number') {
      this.timeframeSeconds = tf;
    } else {
      this.timeframeSeconds = map[tf] || 300;
    }
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  updateSettings(settings: BubbleSettings): void {
    this.settings = settings;
    this.notifyListeners();
  }

  clear(): void {
    this.bubbles = [];
    this.bubblesByBarTime.clear();
    this.notifyListeners();
  }

  /**
   * Process a live market trade from the exchange
   * Aggregates trades into ONE dominant bubble per candle interval
   */
  addTrade(trade: MarketTrade): TradeBubble | null {
    // Filter dust trades (< minTradeNotional or minTradeQty)
    if (trade.notional < this.settings.minTradeNotional || trade.quantity < this.settings.minTradeQty) {
      return null;
    }

    const tradeSec = Math.floor(trade.timestamp / 1000);
    const tfSec = this.timeframeSeconds > 0 ? this.timeframeSeconds : 0;
    const barTimeMs =
      tfSec > 0
        ? Math.floor(tradeSec / tfSec) * tfSec * 1000
        : Math.floor(trade.timestamp / (this.settings.aggregationIntervalMs || 250)) *
          (this.settings.aggregationIntervalMs || 250);
    const bucketIntervalMs = tfSec > 0 ? tfSec * 1000 : this.settings.aggregationIntervalMs || 250;

    // Check if a bubble already exists for this candle bar time
    let existing = this.bubblesByBarTime.get(barTimeMs);
    if (!existing && this.bubbles.length > 0) {
      const last = this.bubbles[this.bubbles.length - 1];
      if (Math.abs(last.timestamp - barTimeMs) < bucketIntervalMs) {
        existing = last;
      }
    }

    if (existing) {
      const prevTotal = existing.totalQty;
      const newTotal = prevTotal + trade.quantity;
      if (trade.side === 'buy') {
        existing.buyQty += trade.quantity;
      } else {
        existing.sellQty += trade.quantity;
      }
      existing.totalQty = newTotal;
      existing.totalNotional += trade.notional;
      // Volume-Weighted Average Price (VWAP)
      existing.price = (existing.price * prevTotal + trade.price * trade.quantity) / newTotal;
      existing.buyRatio = newTotal > 0 ? existing.buyQty / newTotal : 0.5;
      existing.dominantSide = existing.buyQty >= existing.sellQty ? 'buy' : 'sell';
      existing.tradeCount += 1;
      this.updateVolumeStats();
      this.notifyListeners();
      return existing;
    }

    // Otherwise create ONE bubble for this candle interval centered directly on the candle
    const bubble: TradeBubble = {
      id: `b_${barTimeMs}`,
      timestamp: barTimeMs, // Aligned directly with candle timestamp in Lightweight Charts
      price: trade.price,
      buyQty: trade.side === 'buy' ? trade.quantity : 0,
      sellQty: trade.side === 'sell' ? trade.quantity : 0,
      totalQty: trade.quantity,
      totalNotional: trade.notional,
      buyRatio: trade.side === 'buy' ? 1.0 : 0.0,
      tradeCount: 1,
      dominantSide: trade.side,
    };

    this.bubbles.push(bubble);
    this.bubblesByBarTime.set(barTimeMs, bubble);
    if (this.bubbles.length > this.maxRetainedBubbles) {
      const removed = this.bubbles.shift();
      if (removed) {
        for (const [k, v] of this.bubblesByBarTime.entries()) {
          if (v === removed) {
            this.bubblesByBarTime.delete(k);
            break;
          }
        }
      }
    }

    this.updateVolumeStats();
    this.notifyListeners();
    return bubble;
  }

  private stats: { minVolume: number; maxVolume: number } = { minVolume: 1, maxVolume: 50 };

  private updateVolumeStats(): void {
    if (this.bubbles.length === 0) {
      this.stats = { minVolume: 1, maxVolume: 50 };
      return;
    }
    let min = Number.MAX_SAFE_INTEGER;
    let max = 0.001;
    for (const b of this.bubbles) {
      if (b.totalQty > 0) {
        if (b.totalQty < min) min = b.totalQty;
        if (b.totalQty > max) max = b.totalQty;
      }
    }
    this.stats = {
      minVolume: min < Number.MAX_SAFE_INTEGER ? min : 1,
      maxVolume: Math.max(min * 1.5, max),
    };
  }

  /**
   * Seed trade volume bubbles: exactly one clean 3D bubble per candle along the price path
   * Matches Bookmap reference image
   */
  seedFromCandles(
    candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>
  ): void {
    this.bubbles = [];
    this.bubblesByBarTime.clear();
    if (!candles || candles.length === 0) return;

    const tfSec = this.timeframeSeconds > 0 ? this.timeframeSeconds : 300;

    for (const c of candles) {
      if (c.volume <= 0) continue;
      const barTimeMs = c.time * 1000;
      const isBullish = c.close >= c.open;
      const bodyRatio = Math.abs(c.close - c.open) / Math.max(0.01, c.high - c.low);
      const buyRatio = isBullish ? 0.5 + bodyRatio * 0.35 : 0.5 - bodyRatio * 0.35;
      const totalQty = c.volume;
      const vwap = (c.open + c.high + c.low + 2 * c.close) / 5;

      const bubble: TradeBubble = {
        id: `b_${c.time}`,
        timestamp: barTimeMs, // Centered on candlestick in Lightweight Charts
        price: vwap,
        buyQty: totalQty * buyRatio,
        sellQty: totalQty * (1 - buyRatio),
        totalQty,
        totalNotional: totalQty * c.close,
        buyRatio: Math.max(0.08, Math.min(0.92, buyRatio)),
        tradeCount: Math.max(1, Math.round(totalQty * 4)),
        dominantSide: isBullish ? 'buy' : 'sell',
      };

      this.bubbles.push(bubble);
      this.bubblesByBarTime.set(barTimeMs, bubble);
    }

    if (this.bubbles.length > this.maxRetainedBubbles) {
      this.bubbles = this.bubbles.slice(-this.maxRetainedBubbles);
    }

    this.updateVolumeStats();
    this.notifyListeners();
  }

  /**
   * Calculate screen radius (pixels) for a given trade bubble
   * Varies smoothly and proportionately according to traded volume
   */
  calculateRadius(bubble: TradeBubble, settings: BubbleSettings = this.settings): number {
    const baseRadius = settings.minRadiusPx || 6;
    const maxRadius = settings.maxRadiusPx || 38;

    const minVol = this.stats.minVolume || 1;
    const maxVol = Math.max(minVol * 1.5, this.stats.maxVolume || 50);

    // Dynamic square-root scaling relative to observed volume spectrum
    const norm = Math.max(
      0,
      Math.min(1.0, (Math.sqrt(bubble.totalQty) - Math.sqrt(minVol)) / (Math.sqrt(maxVol) - Math.sqrt(minVol) + 0.001))
    );

    // Non-linear exponent to accentuate the visual contrast between small and large volume trades
    const factor = Math.pow(norm, 0.7);
    const radius = baseRadius + factor * (maxRadius - baseRadius);

    return Math.max(settings.minRadiusPx, Math.min(settings.maxRadiusPx, radius * settings.bubbleScale));
  }

  /**
   * Get bubbles visible within time window [fromTimeMs, toTimeMs]
   * Strictly filters bubbles by user-configured minTradeNotional and minTradeQty
   */
  getVisibleBubbles(fromTimeMs: number, toTimeMs: number, settings: BubbleSettings = this.settings): TradeBubble[] {
    if (settings && settings.enabled === false) return [];

    const tfSec = this.timeframeSeconds;
    const filtered = this.bubbles.filter((b) => {
      if (b.timestamp < fromTimeMs || b.timestamp > toTimeMs) return false;
      if (b.dominantSide === 'buy' && !settings.showBuyBubbles) return false;
      if (b.dominantSide === 'sell' && !settings.showSellBubbles) return false;
      // Filter dynamically by minimum trade notional ($ size) and min trade quantity
      if (b.totalNotional < settings.minTradeNotional) return false;
      if (b.totalQty < settings.minTradeQty) return false;
      return true;
    });

    if (tfSec <= 0) {
      return filtered;
    }

    // Strictly enforce at most ONE bubble per candle bucket
    const bucketMap = new Map<number, TradeBubble>();
    for (const b of filtered) {
      const bucket = Math.floor(Math.floor(b.timestamp / 1000) / tfSec);
      const prev = bucketMap.get(bucket);
      if (!prev || b.totalQty > prev.totalQty) {
        bucketMap.set(bucket, b);
      }
    }
    return Array.from(bucketMap.values());
  }

  getAllBubbles(): TradeBubble[] {
    return this.bubbles;
  }

  /**
   * Hover hit-test: finds closest bubble under mouse pointer (x, y)
   */
  hitTest(
    x: number,
    y: number,
    visibleBubblesWithCoords: Array<{ bubble: TradeBubble; cx: number; cy: number; radius: number }>
  ): TradeBubble | null {
    // Reverse search so topmost bubble is hit first
    for (let i = visibleBubblesWithCoords.length - 1; i >= 0; i--) {
      const item = visibleBubblesWithCoords[i];
      const dx = x - item.cx;
      const dy = y - item.cy;
      if (dx * dx + dy * dy <= (item.radius + 2) * (item.radius + 2)) {
        return item.bubble;
      }
    }
    return null;
  }
}
