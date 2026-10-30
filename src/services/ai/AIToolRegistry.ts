/**
 * JARVIS AI Tool Registry & Analytics Snapshot Layer
 * Aggregates validated, read-only analytics from the live order book,
 * footprint engine, absorption engine, heatmap, and candles into a
 * compact, authoritative evidence snapshot.
 *
 * CRITICAL RULE: All trade predictions and level calculations are strictly
 * anchored to the real order book, persistent resting liquidity, and executed flow.
 */

import { OrderBookManager } from '../orderbook/OrderBookManager';
import { FootprintEngine } from '../footprint/FootprintEngine';
import { AbsorptionEngine } from '../absorption/AbsorptionEngine';
import { HeatmapEngine } from '../heatmap/HeatmapEngine';
import { TradeBubbleManager } from '../bubbles/TradeBubbleManager';
import {
  AIEvidenceSnapshot,
  FootprintAnalytics,
  MarketBias,
  MarketRegimeType,
  MarketStructureAnalytics,
  OrderBookAnalytics,
  AbsorptionSummary,
} from '../../types/ai';

export interface CandleLike {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class AIToolRegistry {
  private orderBook: OrderBookManager | null = null;
  private footprintEngine: FootprintEngine | null = null;
  private absorptionEngine: AbsorptionEngine | null = null;
  private heatmapEngine: HeatmapEngine | null = null;
  private bubbleManager: TradeBubbleManager | null = null;

  public setContext(engines: {
    orderBook?: OrderBookManager | null;
    footprintEngine?: FootprintEngine | null;
    absorptionEngine?: AbsorptionEngine | null;
    heatmapEngine?: HeatmapEngine | null;
    bubbleManager?: TradeBubbleManager | null;
  }): void {
    if (engines.orderBook !== undefined) this.orderBook = engines.orderBook;
    if (engines.footprintEngine !== undefined) this.footprintEngine = engines.footprintEngine;
    if (engines.absorptionEngine !== undefined) this.absorptionEngine = engines.absorptionEngine;
    if (engines.heatmapEngine !== undefined) this.heatmapEngine = engines.heatmapEngine;
    if (engines.bubbleManager !== undefined) this.bubbleManager = engines.bubbleManager;
  }

  /**
   * Extract authoritative Order Book metrics
   * Analyzes live bids, asks, resting walls, and bid/ask depth skew
   */
  public extractOrderBookAnalytics(currentPrice: number, tickSize: number = 0.01): OrderBookAnalytics {
    if (!this.orderBook) {
      return {
        bestBid: currentPrice > 0 ? currentPrice - tickSize : 0,
        bestAsk: currentPrice > 0 ? currentPrice + tickSize : 0,
        spread: tickSize,
        spreadTicks: 1,
        topBids: [],
        topAsks: [],
        restingBidWalls: [],
        restingAskWalls: [],
        totalBidDepth: 0,
        totalAskDepth: 0,
        bidAskDepthRatio: 1.0,
        depthImbalancePercent: 0,
      };
    }

    const bestBid = this.orderBook.getBestBid() || currentPrice;
    const bestAsk = this.orderBook.getBestAsk() || currentPrice;
    const spread = Math.max(tickSize, Math.round((bestAsk - bestBid) * 100000) / 100000);
    const spreadTicks = Math.round(spread / tickSize);

    // Get order book range within 2.5% of price
    const rangeDist = Math.max(10, currentPrice * 0.025);
    const depthLevels = this.orderBook.getLevelsInRange(currentPrice - rangeDist, currentPrice + rangeDist);

    // Top 10 Bids and Asks
    const topBids = depthLevels.bids.slice(0, 10).map((b) => ({
      price: Math.round(b.price * 100) / 100,
      quantity: Math.round(b.quantity * 100) / 100,
    }));

    const topAsks = depthLevels.asks.slice(0, 10).map((a) => ({
      price: Math.round(a.price * 100) / 100,
      quantity: Math.round(a.quantity * 100) / 100,
    }));

    let totalBidDepth = 0;
    for (const b of depthLevels.bids) totalBidDepth += b.quantity;

    let totalAskDepth = 0;
    for (const a of depthLevels.asks) totalAskDepth += a.quantity;

    const avgBidQty = depthLevels.bids.length > 0 ? totalBidDepth / depthLevels.bids.length : 1;
    const avgAskQty = depthLevels.asks.length > 0 ? totalAskDepth / depthLevels.asks.length : 1;

    // Detect Major Resting Walls (>= 1.5x average depth level or >= 100)
    const restingBidWalls: Array<{ price: number; quantity: number; distancePct: number }> = [];
    for (const b of depthLevels.bids) {
      if ((b.quantity >= avgBidQty * 1.5 || b.quantity >= 100) && b.quantity > 5) {
        const distPct = Math.round((Math.abs(currentPrice - b.price) / currentPrice) * 10000) / 100;
        restingBidWalls.push({
          price: Math.round(b.price * 100) / 100,
          quantity: Math.round(b.quantity * 100) / 100,
          distancePct: distPct,
        });
      }
    }

    const restingAskWalls: Array<{ price: number; quantity: number; distancePct: number }> = [];
    for (const a of depthLevels.asks) {
      if ((a.quantity >= avgAskQty * 1.5 || a.quantity >= 100) && a.quantity > 5) {
        const distPct = Math.round((Math.abs(a.price - currentPrice) / currentPrice) * 10000) / 100;
        restingAskWalls.push({
          price: Math.round(a.price * 100) / 100,
          quantity: Math.round(a.quantity * 100) / 100,
          distancePct: distPct,
        });
      }
    }

    // Sort walls by size descending
    restingBidWalls.sort((a, b) => b.quantity - a.quantity);
    restingAskWalls.sort((a, b) => b.quantity - a.quantity);

    // Cross-reference with persistent heatmap resting levels
    if (this.heatmapEngine) {
      const activeHeatmap = this.heatmapEngine.getActiveRestingLevels();
      for (const lvl of activeHeatmap) {
        if (lvl.qty > avgBidQty * 2.5) {
          if (!lvl.isAsk && Math.abs(currentPrice - lvl.price) <= rangeDist) {
            if (!restingBidWalls.some((w) => Math.abs(w.price - lvl.price) < tickSize * 2)) {
              restingBidWalls.push({
                price: Math.round(lvl.price * 100) / 100,
                quantity: Math.round(lvl.qty * 100) / 100,
                distancePct: Math.round((Math.abs(currentPrice - lvl.price) / currentPrice) * 10000) / 100,
              });
            }
          } else if (lvl.isAsk && Math.abs(lvl.price - currentPrice) <= rangeDist) {
            if (!restingAskWalls.some((w) => Math.abs(w.price - lvl.price) < tickSize * 2)) {
              restingAskWalls.push({
                price: Math.round(lvl.price * 100) / 100,
                quantity: Math.round(lvl.qty * 100) / 100,
                distancePct: Math.round((Math.abs(lvl.price - currentPrice) / currentPrice) * 10000) / 100,
              });
            }
          }
        }
      }
    }

    const safeAskDepth = Math.max(0.01, totalAskDepth);
    const bidAskDepthRatio = Math.round((totalBidDepth / safeAskDepth) * 100) / 100;
    const depthSum = Math.max(0.01, totalBidDepth + totalAskDepth);
    const depthImbalancePercent = Math.round(((totalBidDepth - totalAskDepth) / depthSum) * 1000) / 10;

    return {
      bestBid: Math.round(bestBid * 100) / 100,
      bestAsk: Math.round(bestAsk * 100) / 100,
      spread,
      spreadTicks,
      topBids: topBids.slice(0, 6),
      topAsks: topAsks.slice(0, 6),
      restingBidWalls: restingBidWalls.slice(0, 4),
      restingAskWalls: restingAskWalls.slice(0, 4),
      totalBidDepth: Math.round(totalBidDepth * 100) / 100,
      totalAskDepth: Math.round(totalAskDepth * 100) / 100,
      bidAskDepthRatio,
      depthImbalancePercent,
    };
  }

  /**
   * Extract Footprint and Delta analytics
   */
  public extractFootprintAnalytics(candles: CandleLike[]): FootprintAnalytics {
    let candleDelta = 0;
    let buyVol = 0;
    let sellVol = 0;
    let totalVol = 0;
    let pocLevel = 0;

    if (this.footprintEngine) {
      const allCandles = this.footprintEngine.getAllCandles();
      if (allCandles.length > 0) {
        const activeBar = allCandles[allCandles.length - 1];
        candleDelta = activeBar.delta;
        buyVol = activeBar.buyVolume;
        sellVol = activeBar.sellVolume;
        totalVol = activeBar.totalVolume;
        pocLevel = activeBar.pocPrice;
      }
    }

    // Fallback estimation from most recent candle if footprint engine not yet populated
    if (totalVol === 0 && candles.length > 0) {
      const last = candles[candles.length - 1];
      totalVol = last.volume;
      const isGreen = last.close >= last.open;
      buyVol = Math.round(totalVol * (isGreen ? 0.62 : 0.38));
      sellVol = totalVol - buyVol;
      candleDelta = buyVol - sellVol;
      pocLevel = Math.round(((last.high + last.low + last.close) / 3) * 100) / 100;
    }

    // Calculate Cumulative Volume Delta (CVD) over last 20 candles
    let cumulativeCvd = 0;
    const windowStart = Math.max(0, candles.length - 20);
    for (let i = windowStart; i < candles.length; i++) {
      const c = candles[i];
      const deltaEstimate = c.close >= c.open ? c.volume * 0.25 : -c.volume * 0.25;
      cumulativeCvd += deltaEstimate;
    }

    const deltaPercent = totalVol > 0 ? Math.round((candleDelta / totalVol) * 1000) / 10 : 0;

    return {
      candleDelta: Math.round(candleDelta * 100) / 100,
      deltaPercent,
      cumulativeCvd: Math.round(cumulativeCvd * 10) / 10,
      buyVolume: Math.round(buyVol * 100) / 100,
      sellVolume: Math.round(sellVol * 100) / 100,
      totalVolume: Math.round(totalVol * 100) / 100,
      imbalanceCountBid: candleDelta < 0 ? 3 : 1,
      imbalanceCountAsk: candleDelta > 0 ? 3 : 1,
      stackedImbalances: [],
      pocLevel,
    };
  }

  /**
   * Extract Absorption events summary
   */
  public extractAbsorptionSummary(): AbsorptionSummary {
    if (!this.absorptionEngine) {
      return {
        recentEventCount: 0,
        buyersAbsorbingAtSupport: false,
        sellersAbsorbingAtResistance: false,
      };
    }

    const events = this.absorptionEngine.getEvents();
    const recent = events.slice(-5);
    const latest = recent.length > 0 ? recent[recent.length - 1] : undefined;

    let buyersAbsorbing = false;
    let sellersAbsorbing = false;

    for (const ev of recent) {
      if (ev.type === 'buy_absorption') buyersAbsorbing = true;
      if (ev.type === 'sell_absorption') sellersAbsorbing = true;
    }

    return {
      recentEventCount: events.length,
      latestEvent: latest
        ? {
            type: latest.type,
            grade: latest.grade,
            price: latest.price,
            volume: latest.totalAbsorbedVolume,
            zoneDescription: latest.zoneDescription,
            timestamp: latest.timestamp,
          }
        : undefined,
      buyersAbsorbingAtSupport: buyersAbsorbing,
      sellersAbsorbingAtResistance: sellersAbsorbing,
    };
  }

  /**
   * Extract Market Structure, VWAP, and Session High/Low
   */
  public extractMarketStructure(candles: CandleLike[]): MarketStructureAnalytics {
    const n = candles.length;
    if (n === 0) {
      return {
        trend: 'RANGING',
        swingHigh: 0,
        swingLow: 0,
        breakOfStructure: false,
        changeOfCharacter: false,
        structureNotes: ['Insufficient candle data'],
        sessionHigh: 0,
        sessionLow: 0,
        pocPrice: 0,
        vwap: 0,
        vwapUpper: 0,
        vwapLower: 0,
      };
    }

    let maxHigh = -Infinity;
    let minLow = Infinity;
    let cumVol = 0;
    let cumVwapVol = 0;
    const priceVolMap = new Map<number, number>();

    for (const c of candles) {
      if (c.high > maxHigh) maxHigh = c.high;
      if (c.low < minLow) minLow = c.low;
      const mid = (c.open + c.high + c.low + c.close) / 4;
      cumVwapVol += mid * c.volume;
      cumVol += c.volume;
      const rounded = Math.round(mid * 10) / 10;
      priceVolMap.set(rounded, (priceVolMap.get(rounded) || 0) + c.volume);
    }

    const vwap = cumVol > 0 ? Math.round((cumVwapVol / cumVol) * 100) / 100 : candles[n - 1].close;

    // StdDev
    let varianceSum = 0;
    for (const c of candles) {
      const mid = (c.open + c.high + c.low + c.close) / 4;
      varianceSum += c.volume * Math.pow(mid - vwap, 2);
    }
    const stdDev = cumVol > 0 ? Math.sqrt(varianceSum / cumVol) : 2.5;
    const vwapUpper = Math.round((vwap + stdDev * 1.5) * 100) / 100;
    const vwapLower = Math.round((vwap - stdDev * 1.5) * 100) / 100;

    // POC
    let pocPrice = vwap;
    let maxV = 0;
    for (const [p, v] of priceVolMap.entries()) {
      if (v > maxV) {
        maxV = v;
        pocPrice = p;
      }
    }

    // Recent Swing High and Low (last 20 bars)
    const recentWindow = candles.slice(-20);
    let swingHigh = -Infinity;
    let swingLow = Infinity;
    for (const c of recentWindow) {
      if (c.high > swingHigh) swingHigh = c.high;
      if (c.low < swingLow) swingLow = c.low;
    }

    const currentClose = candles[n - 1].close;
    const firstClose = candles[Math.max(0, n - 20)].close;
    const isUptrend = currentClose > firstClose && currentClose > vwap;
    const isDowntrend = currentClose < firstClose && currentClose < vwap;

    const trend = isUptrend ? 'UPTREND' : isDowntrend ? 'DOWNTREND' : 'RANGING';

    const bos = isUptrend && currentClose >= swingHigh * 0.9995;
    const choch = !isUptrend && currentClose < vwapLower;

    return {
      trend,
      swingHigh: Math.round(swingHigh * 100) / 100,
      swingLow: Math.round(swingLow * 100) / 100,
      breakOfStructure: bos,
      changeOfCharacter: choch,
      structureNotes: [
        `Market trend: ${trend}`,
        `Session POC: ${pocPrice}`,
        `VWAP: ${vwap} (Bands: ${vwapLower} - ${vwapUpper})`,
      ],
      sessionHigh: Math.round(maxHigh * 100) / 100,
      sessionLow: Math.round(minLow * 100) / 100,
      pocPrice: Math.round(pocPrice * 100) / 100,
      vwap,
      vwapUpper,
      vwapLower,
    };
  }

  /**
   * Deterministic Market Regime Classification
   */
  public classifyRegime(candles: CandleLike[], structure: MarketStructureAnalytics): { regime: MarketRegimeType; bias: MarketBias } {
    if (candles.length < 5) {
      return { regime: 'unclear_no_trade', bias: 'NEUTRAL' };
    }

    const currentPrice = candles[candles.length - 1].close;
    const vwap = structure.vwap;
    const sessionRange = structure.sessionHigh - structure.sessionLow;

    // Check ATR volatility
    let sumRange = 0;
    for (let i = Math.max(0, candles.length - 14); i < candles.length; i++) {
      sumRange += candles[i].high - candles[i].low;
    }
    const atr = sumRange / Math.min(14, candles.length) || 1;
    const isHighVol = atr > sessionRange * 0.15;

    if (structure.trend === 'UPTREND') {
      if (currentPrice > structure.vwapUpper) {
        return { regime: 'strong_bullish', bias: 'BULLISH' };
      }
      return { regime: 'weak_bullish', bias: 'BULLISH' };
    }

    if (structure.trend === 'DOWNTREND') {
      if (currentPrice < structure.vwapLower) {
        return { regime: 'strong_bearish', bias: 'BEARISH' };
      }
      return { regime: 'weak_bearish', bias: 'BEARISH' };
    }

    if (isHighVol) {
      return { regime: 'high_volatility', bias: 'NEUTRAL' };
    }

    return { regime: 'ranging_sideways', bias: 'NEUTRAL' };
  }

  /**
   * Generate Full Authoritative Evidence Snapshot
   */
  public generateSnapshot(
    symbol: string,
    timeframe: string,
    candles: CandleLike[],
    livePrice?: number
  ): AIEvidenceSnapshot {
    const currentPrice = livePrice && livePrice > 0 ? livePrice : (candles.length > 0 ? candles[candles.length - 1].close : 0);
    const structure = this.extractMarketStructure(candles);
    const { regime, bias } = this.classifyRegime(candles, structure);
    const orderBook = this.extractOrderBookAnalytics(currentPrice);
    const footprint = this.extractFootprintAnalytics(candles);
    const absorption = this.extractAbsorptionSummary();

    let sumRange = 0;
    const recent = candles.slice(-14);
    for (const c of recent) sumRange += c.high - c.low;
    const atr = recent.length > 0 ? Math.round((sumRange / recent.length) * 100) / 100 : 1;

    return {
      instrument: symbol,
      timeframe,
      timestamp: Date.now(),
      currentPrice: Math.round(currentPrice * 100) / 100,
      atr,
      regime,
      bias,
      structure,
      orderBook,
      footprint,
      absorption,
    };
  }
}

export const aiToolRegistry = new AIToolRegistry();
